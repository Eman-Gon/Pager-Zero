import { validateDiagnosis } from './diagnosis-validate.js';
import { log } from './log.js';

export interface CandidateFix {
  path: string;
  content: string;
}

export interface Diagnosis {
  severity: 'low' | 'medium' | 'high';
  root_cause_explanation: string;
  proposed_fix_approach: string;
  cited_runbook: string | null;
  candidate_fix?: CandidateFix;
  candidate_fixes?: CandidateFix[];
}

export interface LlmConnectionInfo {
  configured: boolean;
  provider: string;
  model: string;
  base_url: string;
}

const DIAGNOSIS_SYSTEM_PROMPT = `You are an on-call engineer diagnosing a production incident from the context provided in the user message: incident summary, root-cause source, failing tests, blast-radius callers, and retrieved runbooks.
Ground every claim in the provided source — quote the exact broken expression. Do not invent files or imports not in the context.
Respond with ONLY a JSON object. No markdown fences. No prose before or after.
Required keys: severity (low|medium|high), root_cause_explanation, proposed_fix_approach, cited_runbook (exact title or null), candidate_fix ({path, content}).
candidate_fix.path is repo-relative (e.g. src/tax.ts). candidate_fix.content is the FULL corrected file — every line preserved except the broken expression.
If N candidates are requested in the context, add candidate_fixes array; first element must equal candidate_fix.`;

function gatewayConfig(): { url: string; key: string; model: string } {
  const provider = process.env.LLM_PROVIDER ?? 'butterbase';
  if (provider === 'openai') {
    return {
      url: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
      key: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o',
    };
  }
  if (provider === 'nebius') {
    return {
      url: (process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, ''),
      key: process.env.NEBIUS_API_KEY ?? '',
      model: process.env.NEBIUS_CHAT_MODEL ?? 'meta-llama/Llama-3.3-70B-Instruct',
    };
  }
  return {
    url: (process.env.BUTTERBASE_GATEWAY_URL ?? 'https://api.butterbase.ai/v1').replace(/\/$/, ''),
    key: process.env.BUTTERBASE_API_KEY ?? '',
    model: process.env.BUTTERBASE_CHAT_MODEL ?? 'anthropic/claude-sonnet-4.6',
  };
}

export function llmConfigured(): boolean {
  return Boolean(gatewayConfig().key);
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function parseLooseJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function parseDiagnosisResponse(raw: unknown): Diagnosis {
  if (raw && typeof raw === 'object') {
    return validateDiagnosis(raw);
  }
  const text = stripMarkdownFences(String(raw ?? ''));
  try {
    return validateDiagnosis(JSON.parse(text));
  } catch {
    const loose = parseLooseJson(text);
    if (!loose) throw new Error('LLM response was not valid JSON');
    return validateDiagnosis(loose);
  }
}

async function callLlm(context: string): Promise<Diagnosis> {
  const gw = gatewayConfig();
  if (!gw.key) throw new Error('LLM API key not configured');

  const timeoutMs = Number(process.env.RESCUEOPS_DIAGNOSE_TIMEOUT_MS ?? 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${gw.url}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gw.key}` },
      body: JSON.stringify({
        model: gw.model,
        messages: [
          { role: 'system', content: DIAGNOSIS_SYSTEM_PROMPT },
          { role: 'user', content: context },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return parseDiagnosisResponse(content);
  } finally {
    clearTimeout(timer);
  }
}

export class DiagnosisPipeline {
  connectionInfo(): LlmConnectionInfo {
    const gw = gatewayConfig();
    return {
      configured: Boolean(gw.key),
      provider: process.env.LLM_PROVIDER ?? 'butterbase',
      model: gw.model,
      base_url: gw.url,
    };
  }

  async ensureConfigured(): Promise<void> {
    if (!llmConfigured()) {
      throw new Error('LLM not configured — set BUTTERBASE_API_KEY or OPENAI_API_KEY');
    }
  }

  async warmup(): Promise<void> {
    await this.ensureConfigured();
  }

  async diagnose(context: string): Promise<Diagnosis> {
    await this.ensureConfigured();
    const diagnosis = await callLlm(context);
    log('diagnose_llm_done', {
      provider: this.connectionInfo().provider,
      severity: diagnosis.severity,
      cited_runbook: diagnosis.cited_runbook,
    });
    return diagnosis;
  }
}

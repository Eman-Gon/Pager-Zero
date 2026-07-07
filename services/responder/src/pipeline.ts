import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question, RocketRideClient } from 'rocketride';
import { validateDiagnosis } from './diagnosis-validate.js';
import { log } from './log.js';

const RESPONDER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE_PIPELINE_PATH = path.join(RESPONDER_DIR, 'rescueops-diagnose-native.pipe');
const AGENT_PIPELINE_PATH = path.join(RESPONDER_DIR, 'rescueops-diagnose-agent.pipe');
const QUERY_PIPELINE_PATH = path.join(RESPONDER_DIR, 'rescueops-diagnose-query.pipe');
const LEGACY_PIPELINE_PATH = path.join(RESPONDER_DIR, 'diagnose.pipe');

export type PipelineKind = 'native' | 'agent' | 'query';

// Fallback when the model wraps its JSON in prose or ```json fences.
function parseLooseJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return parsePythonLiteral(match[0]);
  }
}

function parsePythonLiteral(text: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const fail = (): never => {
    throw new Error(`python literal parse failed at ${i}`);
  };
  const str = (): string => {
    const quote = text[i++];
    let out = '';
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') {
        const c = text[++i];
        if (c === 'n') out += '\n';
        else if (c === 't') out += '\t';
        else if (c === 'r') out += '\r';
        else if (c === 'x') {
          out += String.fromCharCode(parseInt(text.slice(i + 1, i + 3), 16));
          i += 2;
        } else if (c === 'u') {
          out += String.fromCharCode(parseInt(text.slice(i + 1, i + 5), 16));
          i += 4;
        } else out += c;
        i++;
      } else out += text[i++];
    }
    if (text[i++] !== quote) fail();
    return out;
  };
  const value = (): unknown => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === '}') return (i++, obj);
      for (;;) {
        ws();
        const key = text[i] === "'" || text[i] === '"' ? str() : fail();
        ws();
        if (text[i++] !== ':') fail();
        obj[key as string] = value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === '}') return (i++, obj);
        else fail();
      }
    }
    if (c === '[') {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === ']') return (i++, arr);
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === ']') return (i++, arr);
        else fail();
      }
    }
    if (c === "'" || c === '"') return str();
    if (text.startsWith('True', i)) return ((i += 4), true);
    if (text.startsWith('False', i)) return ((i += 5), false);
    if (text.startsWith('None', i)) return ((i += 4), null);
    const num = text.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/);
    if (num) return ((i += num[0].length), Number(num[0]));
    return fail();
  };
  try {
    const parsed = value();
    ws();
    return i === text.length ? parsed : null;
  } catch {
    return null;
  }
}

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

export function isLocalRocketRideUri(uri = process.env.ROCKETRIDE_URI ?? 'https://api.rocketride.ai'): boolean {
  return /localhost|127\.0\.0\.1|rocketride:5565/i.test(uri);
}

export function rocketrideConfigured(): boolean {
  return isLocalRocketRideUri() || Boolean(process.env.ROCKETRIDE_APIKEY);
}

function neo4jBasicAuth(): string {
  if (process.env.ROCKETRIDE_NEO4J_BASIC_AUTH) return process.env.ROCKETRIDE_NEO4J_BASIC_AUTH;
  const user = process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j';
  const pass = process.env.NEO4J_PASSWORD ?? '';
  return Buffer.from(`${user}:${pass}`).toString('base64');
}

function gatewayConfig(): { url: string; key: string; model: string } {
  if (process.env.LLM_PROVIDER === 'nebius') {
    return {
      url: (process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, ''),
      key: process.env.NEBIUS_API_KEY ?? '',
      model: process.env.NEBIUS_CHAT_MODEL ?? 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    };
  }
  return {
    url: process.env.BUTTERBASE_GATEWAY_URL ?? 'https://api.butterbase.ai/v1',
    key: process.env.BUTTERBASE_API_KEY ?? '',
    model: process.env.BUTTERBASE_CHAT_MODEL ?? 'anthropic/claude-sonnet-4.6',
  };
}

function rocketrideEnv(): Record<string, string> {
  const gw = gatewayConfig();
  const neo4jUri = process.env.NEO4J_URL ?? process.env.NEO4J_URI ?? 'neo4j://localhost:7687';
  return {
    ROCKETRIDE_BUTTERBASE_GATEWAY_URL: gw.url,
    ROCKETRIDE_BUTTERBASE_API_KEY: gw.key,
    ROCKETRIDE_BUTTERBASE_MODEL: gw.model,
    ROCKETRIDE_BUTTERBASE_MCP_ENDPOINT: process.env.BUTTERBASE_MCP_ENDPOINT ?? 'https://api.butterbase.ai/mcp',
    ROCKETRIDE_BUTTERBASE_MCP_BEARER: process.env.BUTTERBASE_API_KEY ?? '',
    NEO4J_MCP_ENDPOINT: process.env.NEO4J_MCP_ENDPOINT ?? 'http://localhost:8787/mcp',
    ROCKETRIDE_NEO4J_BASIC_AUTH: neo4jBasicAuth(),
    ROCKETRIDE_NEO4J_URI: neo4jUri,
    ROCKETRIDE_NEO4J_USER: process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j',
    ROCKETRIDE_NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? '',
    ROCKETRIDE_NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',
  };
}

function nativePipelinePreferred(): boolean {
  return process.env.RESCUEOPS_NATIVE_PIPELINE === '1';
}

function parseDiagnosisResponse(raw: unknown): Diagnosis {
  let parsed: unknown;
  if (raw && typeof raw === 'object') {
    parsed = raw;
  } else {
    const text = String(raw ?? '');
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = parseLooseJson(text);
    }
  }
  return validateDiagnosis(parsed);
}

const AGENT_FOOTER = `---
Use keyed memory across waves. Ground candidate_fix.content in the source snippets above when provided.
Return ONLY the JSON diagnosis object (severity, root_cause_explanation, proposed_fix_approach, cited_runbook, candidate_fix).`;

export class DiagnosisPipeline {
  private client: RocketRideClient;
  private pipelineToken: string | null = null;
  private activePipeline: PipelineKind | null = null;
  private waveLog: string[] = [];

  constructor() {
    this.client = new RocketRideClient({
      auth: process.env.ROCKETRIDE_APIKEY,
      uri: process.env.ROCKETRIDE_URI ?? 'https://api.rocketride.ai',
      requestTimeout: 180_000,
      persist: false,
      maxRetryTime: 60_000,
      onDisconnected: async (reason, hasError) => {
        log('rocketride_disconnected', { reason, hasError });
        this.clearPipeline();
      },
      onEvent: async (event: unknown) => {
        const e = event as { type?: string; event?: string; body?: { category?: string; output?: string } };
        const kind = e?.type ?? e?.event ?? '';
        if (kind === 'apaevt_flow' || kind === 'output') {
          const snippet = String(e?.body?.output ?? '').slice(0, 120);
          if (snippet) {
            this.waveLog.push(snippet);
            if (this.waveLog.length > 20) this.waveLog.shift();
          }
        }
      },
      env: rocketrideEnv(),
    });
  }

  private clearPipeline(): void {
    this.pipelineToken = null;
    this.activePipeline = null;
  }

  async ensureConnected(): Promise<void> {
    if (this.client.isConnected()) return;
    if (!rocketrideConfigured()) {
      throw new Error('ROCKETRIDE_APIKEY not set — cannot reach RocketRide Cloud');
    }
    await this.client.connect();
    log('rocketride_connected', this.client.getConnectionInfo());
  }

  connectionInfo(): { connected: boolean; transport: string; uri: string; pipeline?: PipelineKind } {
    return { ...this.client.getConnectionInfo(), pipeline: this.activePipeline ?? undefined };
  }

  getWaveLog(): string[] {
    return [...this.waveLog];
  }

  private async loadPipeline(kind: PipelineKind): Promise<string> {
    const pathByKind: Record<PipelineKind, string> = {
      native: NATIVE_PIPELINE_PATH,
      agent: AGENT_PIPELINE_PATH,
      query: QUERY_PIPELINE_PATH,
    };
    const nameByKind: Record<PipelineKind, string> = {
      native: 'rescueops-diagnose-native',
      agent: 'rescueops-diagnose-agent',
      query: 'rescueops-diagnose-query',
    };
    const filepath = pathByKind[kind];
    const { token } = await this.client.use({ filepath });
    this.pipelineToken = token;
    this.activePipeline = kind;
    log('rocketride_pipeline_loaded', { pipeline: nameByKind[kind], token });
    return token;
  }

  /** Cerberus-style: native → agent → query; cache token across requests. */
  private async ensurePipeline(prefer: PipelineKind | 'auto' = 'auto'): Promise<{ token: string; kind: PipelineKind }> {
    if (this.pipelineToken && this.activePipeline) {
      return { token: this.pipelineToken, kind: this.activePipeline };
    }

    const order: PipelineKind[] =
      prefer === 'query'
        ? ['query']
        : [
            ...(nativePipelinePreferred() ? (['native'] as const) : []),
            ...(process.env.RESCUEOPS_AGENT_PIPELINE !== '0' ? (['agent'] as const) : []),
            'query',
          ];

    for (const kind of order) {
      try {
        const token = await this.loadPipeline(kind);
        return { token, kind };
      } catch (err) {
        log('rocketride_pipeline_failed', { pipeline: kind, error: String(err) });
      }
    }

    try {
      const token = await this.loadPipeline('query');
      return { token, kind: 'query' };
    } catch {
      const { token } = await this.client.use({ filepath: LEGACY_PIPELINE_PATH });
      this.pipelineToken = token;
      this.activePipeline = 'query';
      return { token, kind: 'query' };
    }
  }

  private buildQuestion(context: string, kind: PipelineKind): Question {
    const question = new Question({ expectJson: false });
    if (kind === 'native') {
      question.addQuestion(
        `${context}\n\n${AGENT_FOOTER}\nUse your native Neo4j graph tool (natural-language questions — do NOT write raw Cypher), python blast-radius scorer, and memory.`,
      );
    } else if (kind === 'agent') {
      question.addQuestion(
        `${context}\n\n${AGENT_FOOTER}\nUse Neo4j MCP tools, python blast-radius scorer, and memory.`,
      );
    } else {
      question.addQuestion(context);
    }
    return question;
  }

  private async runOnce(token: string, context: string, kind: PipelineKind): Promise<Diagnosis> {
    this.waveLog = [];
    const response: any = await this.client.chat({ token, question: this.buildQuestion(context, kind) });
    const raw: unknown = response?.data?.answer ?? response?.answers?.[0];
    return parseDiagnosisResponse(raw);
  }

  async diagnose(context: string): Promise<Diagnosis> {
    await this.ensureConnected();
    let { token, kind } = await this.ensurePipeline('auto');

    try {
      try {
        const diagnosis = await this.runOnce(token, context, kind);
        log('diagnose_pipeline_done', {
          pipeline: kind,
          severity: diagnosis.severity,
          cited_runbook: diagnosis.cited_runbook,
          waves: this.waveLog.length,
        });
        return diagnosis;
      } catch (err) {
        log('diagnose_pipeline_retry', { pipeline: kind, error: String(err) });
        if (kind === 'query') throw err;
        // Agent/native returned garbage — fall back to query pipe with full context.
        this.clearPipeline();
        ({ token, kind } = await this.ensurePipeline('query'));
        const diagnosis = await this.runOnce(token, context, 'query');
        log('diagnose_pipeline_done', { pipeline: kind, fallback: true, severity: diagnosis.severity });
        return diagnosis;
      }
    } catch (err) {
      this.clearPipeline();
      throw err;
    }
  }
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question, RocketRideClient } from 'rocketride';
import { log } from './log.js';

const RESPONDER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Native pipe: reaches Neo4j via RocketRide's own db_neo4j component and adds the
// native tool_butterbase — "all three sponsor tools inside RocketRide". Opt-in.
const NATIVE_PIPELINE_PATH = path.join(RESPONDER_DIR, 'rescueops-diagnose-native.pipe');
const AGENT_PIPELINE_PATH = path.join(RESPONDER_DIR, 'rescueops-diagnose-agent.pipe');
const QUERY_PIPELINE_PATH = path.join(RESPONDER_DIR, 'rescueops-diagnose-query.pipe');
/** @deprecated Use rescueops-diagnose-query.pipe — kept for reference */
const LEGACY_PIPELINE_PATH = path.join(RESPONDER_DIR, 'diagnose.pipe');

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

// The cloud's answers lane str()'s the model's parsed JSON, so a dict answer
// arrives as a Python repr: single-quoted strings, True/False/None. A real
// recursive-descent parse — regex quote-swapping would corrupt source code
// embedded in candidate_fix.content.
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
        } else out += c; // \\ \' \" and anything else literal
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

// Integration 4: the diagnosis LLM gateway is provider-switchable. Default is the
// Butterbase AI gateway; LLM_PROVIDER=nebius routes inference through Nebius Token
// Factory (OpenAI-compatible) so the stack isn't locked to one model provider —
// Nebius already powers embeddings, this extends it to inference.
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
    // The pipe's LLM node reads these regardless of provider (Butterbase or Nebius).
    ROCKETRIDE_BUTTERBASE_GATEWAY_URL: gw.url,
    ROCKETRIDE_BUTTERBASE_API_KEY: gw.key,
    ROCKETRIDE_BUTTERBASE_MODEL: gw.model,
    ROCKETRIDE_BUTTERBASE_MCP_ENDPOINT: process.env.BUTTERBASE_MCP_ENDPOINT ?? 'https://api.butterbase.ai/mcp',
    // Generic MCP bridge (existing agent pipe).
    NEO4J_MCP_ENDPOINT: process.env.NEO4J_MCP_ENDPOINT ?? 'http://localhost:8787/mcp',
    ROCKETRIDE_NEO4J_BASIC_AUTH: neo4jBasicAuth(),
    // Native db_neo4j component (native pipe): engine connects to Neo4j directly.
    ROCKETRIDE_NEO4J_URI: neo4jUri,
    ROCKETRIDE_NEO4J_USER: process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j',
    ROCKETRIDE_NEO4J_PASSWORD: process.env.NEO4J_PASSWORD ?? '',
    ROCKETRIDE_NEO4J_DATABASE: process.env.NEO4J_DATABASE || 'neo4j',
  };
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
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`pipeline returned non-JSON answer: ${String(raw).slice(0, 300)}`);
  }
  return parsed as Diagnosis;
}

export class DiagnosisPipeline {
  private client: RocketRideClient;
  private pipelineToken: string | null = null;
  private activePipeline: 'native' | 'agent' | 'query' | null = null;

  constructor() {
    this.client = new RocketRideClient({
      auth: process.env.ROCKETRIDE_APIKEY,
      uri: process.env.ROCKETRIDE_URI ?? 'https://api.rocketride.ai',
      requestTimeout: 180_000,
      persist: false,
      maxRetryTime: 60_000,
      onDisconnected: async (reason, hasError) => {
        log('rocketride_disconnected', { reason, hasError });
        this.pipelineToken = null;
        this.activePipeline = null;
      },
      env: rocketrideEnv(),
    });
  }

  async ensureConnected(): Promise<void> {
    if (this.client.isConnected()) return;
    if (!rocketrideConfigured()) {
      throw new Error('ROCKETRIDE_APIKEY not set — cannot reach RocketRide Cloud');
    }
    await this.client.connect();
    log('rocketride_connected', this.client.getConnectionInfo());
  }

  connectionInfo(): { connected: boolean; transport: string; uri: string; pipeline?: string } {
    return { ...this.client.getConnectionInfo(), pipeline: this.activePipeline ?? undefined };
  }

  /** Cerberus-style: native/agent pipeline first (tools + waves), query fallback. */
  private async loadPipeline(): Promise<string> {
    if (this.pipelineToken) return this.pipelineToken;

    // Integration 2: opt-in native pipe (db_neo4j + tool_butterbase). Preferred
    // above the agent pipe when enabled; falls through to it on any failure.
    if (process.env.RESCUEOPS_NATIVE_PIPELINE === '1') {
      try {
        const { token } = await this.client.use({ filepath: NATIVE_PIPELINE_PATH });
        this.pipelineToken = token;
        this.activePipeline = 'native';
        log('rocketride_pipeline_loaded', { pipeline: 'rescueops-diagnose-native', token });
        return token;
      } catch (err) {
        log('rocketride_native_pipeline_failed', { error: String(err) });
      }
    }

    const preferAgent = process.env.RESCUEOPS_AGENT_PIPELINE !== '0';
    if (preferAgent) {
      try {
        const { token } = await this.client.use({ filepath: AGENT_PIPELINE_PATH });
        this.pipelineToken = token;
        this.activePipeline = 'agent';
        log('rocketride_pipeline_loaded', { pipeline: 'rescueops-diagnose-agent', token });
        return token;
      } catch (err) {
        log('rocketride_agent_pipeline_failed', { error: String(err) });
      }
    }

    for (const [name, filepath] of [
      ['rescueops-diagnose-query', QUERY_PIPELINE_PATH],
      ['diagnose', LEGACY_PIPELINE_PATH],
    ] as const) {
      try {
        const { token } = await this.client.use({ filepath });
        this.pipelineToken = token;
        this.activePipeline = 'query';
        log('rocketride_pipeline_loaded', { pipeline: name, token });
        return token;
      } catch (err) {
        log('rocketride_pipeline_failed', { pipeline: name, error: String(err) });
      }
    }

    throw new Error('no RocketRide diagnose pipeline could be loaded');
  }

  async diagnose(context: string): Promise<Diagnosis> {
    await this.ensureConnected();
    const token = await this.loadPipeline();
    try {
      const question = new Question({ expectJson: false });
      if (this.activePipeline === 'native') {
        question.addQuestion(
          `${context}\n\n---\nUse your native Neo4j graph tool (ask natural-language questions — do NOT write Cypher) to explore the code graph (Function, Test, Runbook), store key findings in memory across waves, score blast radius with python.execute, then return ONLY the JSON diagnosis object described in your instructions.`,
        );
      } else if (this.activePipeline === 'agent') {
        question.addQuestion(
          `${context}\n\n---\nUse your Neo4j MCP tools to explore the code graph (Function, Test, Runbook), store key findings in memory across waves, score blast radius with python.execute, then return ONLY the JSON diagnosis object described in your instructions.`,
        );
      } else {
        question.addQuestion(context);
      }

      const response: any = await this.client.chat({ token, question });
      const raw: unknown = response?.data?.answer ?? response?.answers?.[0];
      const diagnosis = parseDiagnosisResponse(raw);
      log('diagnose_pipeline_done', {
        pipeline: this.activePipeline,
        severity: diagnosis.severity,
        cited_runbook: diagnosis.cited_runbook,
      });
      return diagnosis;
    } finally {
      await this.client.terminate(token).catch((err: unknown) => log('terminate_failed', { error: String(err) }));
      this.pipelineToken = null;
      this.activePipeline = null;
    }
  }
}

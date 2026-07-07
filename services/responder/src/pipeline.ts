import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question, RocketRideClient } from 'rocketride';
import { log } from './log.js';

const PIPE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'diagnose.pipe');

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

export class DiagnosisPipeline {
  private client: RocketRideClient;
  private connected = false;

  constructor() {
    this.client = new RocketRideClient({
      auth: process.env.ROCKETRIDE_APIKEY,
      uri: process.env.ROCKETRIDE_URI ?? 'https://api.rocketride.ai',
      requestTimeout: 120_000,
      // ${ROCKETRIDE_*} substitutions referenced by diagnose.pipe — this routes
      // the pipeline's LLM node through the Butterbase AI gateway.
      env: {
        ROCKETRIDE_BUTTERBASE_GATEWAY_URL:
          process.env.BUTTERBASE_GATEWAY_URL ?? 'https://api.butterbase.ai/v1',
        ROCKETRIDE_BUTTERBASE_API_KEY: process.env.BUTTERBASE_API_KEY ?? '',
        ROCKETRIDE_BUTTERBASE_MODEL:
          process.env.BUTTERBASE_CHAT_MODEL ?? 'anthropic/claude-sonnet-4.6',
      },
    });
  }

  async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (!process.env.ROCKETRIDE_APIKEY) {
      throw new Error('ROCKETRIDE_APIKEY not set — cannot reach RocketRide Cloud');
    }
    await this.client.connect();
    this.connected = true;
    log('rocketride_connected', this.client.getConnectionInfo());
  }

  connectionInfo(): { connected: boolean; transport: string; uri: string } {
    return this.client.getConnectionInfo();
  }

  async diagnose(context: string): Promise<Diagnosis> {
    await this.ensureConnected();
    const { token } = await this.client.use({ filepath: PIPE_PATH });
    try {
      // expectJson:false — with expectJson the SDK throws inside chat() when
      // the model wraps its JSON in fences; we parse (strict, then loose) here.
      const question = new Question({ expectJson: false });
      question.addQuestion(context);
      const response: any = await this.client.chat({ token, question });

      const raw: unknown = response?.data?.answer ?? response?.answers?.[0];
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
    } finally {
      await this.client.terminate(token).catch((err: unknown) => log('terminate_failed', { error: String(err) }));
    }
  }
}

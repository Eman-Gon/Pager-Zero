import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Answer, Question, RocketRideClient } from 'rocketride';
import { log } from './log.js';

const PIPE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'diagnose.pipe');

// Fallback when the model wraps its JSON in prose or ```json fences.
function parseLooseJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export interface Diagnosis {
  severity: 'low' | 'medium' | 'high';
  root_cause_explanation: string;
  proposed_fix_approach: string;
  cited_runbook: string | null;
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
      const question = new Question({ expectJson: true });
      question.addQuestion(context);
      const response: any = await this.client.chat({ token, question });

      const answerText: string | undefined = response?.data?.answer ?? response?.answers?.[0];
      const answer = new Answer(true);
      answer.setAnswer(answerText ?? '');
      const parsed = answer.isJson() ? answer.getJson() : parseLooseJson(answerText ?? '');
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`pipeline returned non-JSON answer: ${String(answerText).slice(0, 300)}`);
      }
      return parsed as Diagnosis;
    } finally {
      await this.client.terminate(token).catch((err: unknown) => log('terminate_failed', { error: String(err) }));
    }
  }
}

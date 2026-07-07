import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';

// M6 Phase 2 — Opsera governance layer.
//
// Opsera wraps the ship path with a policy-as-code gate and a DORA
// Time-to-Restore deployment record. It is additive and env-gated: when
// OPSERA_WEBHOOK_URL is unset the gate is a no-op (baseline demo unchanged);
// when set, a policy-violating fix is blocked BEFORE any credit is spent or PR
// opened, and every allowed ship is recorded as a deployment via webhook.

const POLICY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'opsera-policy.json');

interface OpseraPolicy {
  allowed_action_types: string[];
  allowed_path_globs: string[];
  blocked_path_globs: string[];
}

const policy: OpseraPolicy = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));

export class OpseraGateError extends Error {
  constructor(
    message: string,
    public reasons: string[],
  ) {
    super(message);
    this.name = 'OpseraGateError';
  }
}

export function opseraConfigured(): boolean {
  return Boolean(process.env.OPSERA_WEBHOOK_URL);
}

// Minimal glob → RegExp for the deterministic path gate (supports ** and *).
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesAny(globs: string[], value: string): boolean {
  return globs.some((g) => globToRegExp(g).test(value));
}

export interface OpseraGateInput {
  action_type: string;
  fix_path: string;
}

export interface OpseraGateDecision {
  allowed: boolean;
  reasons: string[];
}

/** Deterministic policy-as-code gate. Reported to Opsera; enforced locally. */
export function evaluateOpseraGate(input: OpseraGateInput): OpseraGateDecision {
  const reasons: string[] = [];
  if (!policy.allowed_action_types.includes(input.action_type)) {
    reasons.push(`action type "${input.action_type}" is not in the Opsera allowlist`);
  }
  if (matchesAny(policy.blocked_path_globs, input.fix_path)) {
    reasons.push(`fix path "${input.fix_path}" matches a blocked Opsera path`);
  } else if (!matchesAny(policy.allowed_path_globs, input.fix_path)) {
    reasons.push(`fix path "${input.fix_path}" is outside the allowed Opsera paths`);
  }
  return { allowed: reasons.length === 0, reasons };
}

export interface OpseraDeployment {
  root_cause: string | null;
  fix_path: string;
  pr_url: string;
  branch: string;
  mttr_seconds: number;
  severity: string | null;
}

// Fire the Opsera pipeline webhook to record the deployment + DORA
// Time-to-Restore. Best-effort: shipping never fails because Opsera is down.
export async function recordOpseraDeployment(deployment: OpseraDeployment): Promise<void> {
  if (!opseraConfigured()) return;
  const url = process.env.OPSERA_WEBHOOK_URL!;
  const payload = {
    event: 'rescueops.fix.deployed',
    pipeline: process.env.OPSERA_PIPELINE_ID ?? 'rescueops-ship',
    metric: 'time_to_restore',
    time_to_restore_seconds: deployment.mttr_seconds,
    deployment,
    timestamp: new Date().toISOString(),
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.OPSERA_API_KEY ? { Authorization: `Bearer ${process.env.OPSERA_API_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    log('opsera_deployment_recorded', { status: res.status, ttr: deployment.mttr_seconds });
  } catch (err) {
    log('opsera_webhook_failed', { error: String(err) });
  }
}

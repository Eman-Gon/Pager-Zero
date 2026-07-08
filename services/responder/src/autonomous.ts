import { log } from './log.js';
import { butterbaseConfigured, signInService } from './butterbase.js';
import type { Incident } from './context.js';

// The autonomous on-call loop: watch the sensor, and the moment a *new* incident
// appears, drive the same diagnose → remediate → apply chain a human operator
// would — no dashboard click required. It acts as the service (on-call) account
// so everything persists under RLS, and it goes through the responder's own HTTP
// endpoints so the policy gate, paywall, and persistence all apply unchanged.
// Risky fixes park as pending approvals (never auto-shipped); safe verified fixes
// open a PR.

const SERVICE_EMAIL = process.env.SERVICE_EMAIL ?? 'oncall@rescueops.dev';
// No baked-in credential: autonomous mode requires SERVICE_PASSWORD from env.
const SERVICE_PASSWORD = process.env.SERVICE_PASSWORD ?? '';
const POLL_MS = Math.max(Number(process.env.AUTONOMOUS_POLL_MS ?? 5000), 1000);

// A stable fingerprint for an incident, so we handle each one exactly once and
// re-arm only after it clears (or a genuinely different incident appears).
function signature(incident: Incident): string {
  return `${incident.root_cause ?? 'unknown'}::${[...incident.failing_tests].sort().join(',')}`;
}

async function post(baseUrl: string, path: string, token: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, body };
}

export interface ChainOutcome {
  pr_url?: string;
  status?: string;
  approval_id?: string;
  verified: boolean;
}

// Butterbase (for the service-account sign-in) + a credential must be present
// before any headless chain — the same precondition the autonomous loop enforces.
export function serviceAccountReady(): boolean {
  return butterbaseConfigured() && Boolean(SERVICE_PASSWORD);
}

// The shared headless diagnose → remediate → apply chain, run as the service
// (on-call) account through the responder's own HTTP endpoints so the policy
// gate, paywall, and RLS persistence all apply unchanged. Used by both the
// autonomous loop and the external-incident webhooks (PagerDuty / Sentry).
export async function driveServiceChain(baseUrl: string): Promise<ChainOutcome> {
  // Fresh token per run sidesteps access-token expiry between incidents.
  const token = await signInService(SERVICE_EMAIL, SERVICE_PASSWORD);

  const diagnose = await post(baseUrl, '/diagnose', token);
  log('drive_diagnose', { status: diagnose.status });

  const remediate = await post(baseUrl, '/remediate', token);
  const verified = Boolean((remediate.body as { verified?: boolean } | null)?.verified);
  log('drive_remediate', { status: remediate.status, verified });
  if (!verified) {
    log('drive_no_fix', { hint: 'no verified candidate — leaving incident for a human' });
    return { verified: false };
  }

  const apply = await post(baseUrl, '/apply', token);
  const body = apply.body as
    | { pr_url?: string; status?: string; approval_id?: string; error?: string }
    | null;
  if (body?.pr_url) {
    log('drive_shipped', { pr_url: body.pr_url });
  } else if (body?.status === 'pending_approval') {
    log('drive_pending_approval', { approval_id: body.approval_id });
  } else {
    log('drive_apply_blocked', { status: apply.status, body });
  }
  return { verified: true, pr_url: body?.pr_url, status: body?.status, approval_id: body?.approval_id };
}

async function handleIncident(baseUrl: string, incident: Incident): Promise<void> {
  log('autonomous_incident', { root_cause: incident.root_cause, failing_tests: incident.failing_tests });
  await driveServiceChain(baseUrl);
}

export function startAutonomousLoop(opts: { sensorUrl: string; selfUrl: string }): void {
  if (process.env.AUTONOMOUS !== '1') return;
  if (!butterbaseConfigured()) {
    log('autonomous_disabled', { reason: 'Butterbase not configured — cannot sign in as the service account' });
    return;
  }
  if (!SERVICE_PASSWORD) {
    log('autonomous_disabled', { reason: 'SERVICE_PASSWORD not set — refusing to run with no credential' });
    return;
  }
  log('autonomous_enabled', { poll_ms: POLL_MS, service: SERVICE_EMAIL });

  let handled: string | null = null;
  void (async () => {
    for (;;) {
      try {
        const res = await fetch(`${opts.sensorUrl}/incident`);
        if (res.ok) {
          const incident = (await res.json()) as Incident;
          if (incident.status === 'ok') {
            handled = null; // incident cleared — re-arm for the next one
          } else {
            const sig = signature(incident);
            if (sig !== handled) {
              handled = sig; // mark before handling so a slow chain isn't re-entered
              await handleIncident(opts.selfUrl, incident).catch((err) => {
                log('autonomous_error', { error: String(err) });
                handled = null; // let a transient failure retry on the next tick
              });
            }
          }
        }
      } catch (err) {
        log('autonomous_poll_error', { error: String(err) });
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  })();
}

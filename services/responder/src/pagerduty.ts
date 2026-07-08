import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from './log.js';

// PagerDuty incident-source integration (opt-in, env-flagged, additive).
// Inbound: a V3 webhook `incident.triggered` event triggers the diagnosis chain.
// Outbound: the page is resolved on ship via the REST API (an inbound webhook
// references an incident by id, so resolve uses the REST API + token, NOT the
// Events API routing key which only resolves alerts you triggered yourself).

const ENABLED = process.env.PAGERDUTY_ENABLED === '1';
const WEBHOOK_SECRET = process.env.PAGERDUTY_WEBHOOK_SECRET ?? '';
const API_TOKEN = process.env.PAGERDUTY_API_TOKEN ?? '';
const FROM_EMAIL = process.env.PAGERDUTY_FROM_EMAIL ?? '';

export function pagerdutyEnabled(): boolean {
  return ENABLED;
}

export function pagerdutyResolveConfigured(): boolean {
  return Boolean(API_TOKEN && FROM_EMAIL);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// V3 signature header: "X-PagerDuty-Signature: v1=<hmac-sha256-hex>[,v1=...]".
// When no secret is configured, verification is skipped (local/demo), matching
// the app's degrade-gracefully-when-unconfigured philosophy.
export function verifyPagerDutySignature(rawBody: string, header: string | undefined): boolean {
  if (!WEBHOOK_SECRET) return true;
  if (!header) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
  return header
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1='))
    .map((s) => s.slice(3))
    .some((sig) => safeEqualHex(sig, expected));
}

export interface PagerDutyTrigger {
  incident_id: string;
  title: string;
}

// V3 webhook envelope: { event: { event_type, data: { id, title, ... } } }.
export function parsePagerDutyTrigger(payload: unknown): PagerDutyTrigger | null {
  const event = (payload as { event?: { event_type?: string; data?: Record<string, unknown> } })?.event;
  if (!event || event.event_type !== 'incident.triggered') return null;
  const data = event.data ?? {};
  const incident_id = String(data.id ?? data.incident_key ?? '').trim();
  if (!incident_id) return null;
  return { incident_id, title: String(data.title ?? 'PagerDuty incident') };
}

function pdHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.pagerduty+json;version=2',
    Authorization: `Token token=${API_TOKEN}`,
    From: FROM_EMAIL,
  };
}

// Resolve the page on ship, and (best-effort) drop a note linking the PR + MTTR.
export async function resolvePagerDutyIncident(
  incidentId: string,
  info: { pr_url?: string; mttr_seconds?: number },
): Promise<void> {
  if (!pagerdutyResolveConfigured() || !incidentId) return;
  try {
    if (info.pr_url) {
      const note = `RescueOps++ shipped a verified fix: ${info.pr_url}${
        info.mttr_seconds != null ? ` (MTTR ${info.mttr_seconds}s)` : ''
      }`;
      await fetch(`https://api.pagerduty.com/incidents/${incidentId}/notes`, {
        method: 'POST',
        headers: pdHeaders(),
        body: JSON.stringify({ note: { content: note } }),
      }).catch(() => {
        /* note is best-effort; never block the resolve */
      });
    }
    const res = await fetch(`https://api.pagerduty.com/incidents/${incidentId}`, {
      method: 'PUT',
      headers: pdHeaders(),
      body: JSON.stringify({ incident: { type: 'incident_reference', status: 'resolved' } }),
    });
    log('pagerduty_resolved', { incident_id: incidentId, status: res.status, pr_url: info.pr_url });
  } catch (err) {
    log('pagerduty_resolve_error', { error: String(err) });
  }
}

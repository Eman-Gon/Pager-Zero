import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from './log.js';

// Sentry incident-source integration (opt-in, env-flagged, additive).
// Inbound: an error webhook triggers the diagnosis chain AND its stack trace
// seeds/confirms the root-cause function + enriches the diagnosis context.
// Outbound: the issue is resolved on ship.

const ENABLED = process.env.SENTRY_ENABLED === '1';
const WEBHOOK_SECRET = process.env.SENTRY_WEBHOOK_SECRET ?? '';
const AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN ?? '';

export function sentryEnabled(): boolean {
  return ENABLED;
}

export function sentryResolveConfigured(): boolean {
  return Boolean(AUTH_TOKEN);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// "Sentry-Hook-Signature: <hmac-sha256-hex of the raw body with the client secret>".
// Skipped when no secret is configured (local/demo).
export function verifySentrySignature(rawBody: string, header: string | undefined): boolean {
  if (!WEBHOOK_SECRET) return true;
  if (!header) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
  return safeEqualHex(header, expected);
}

export interface SentryEnrichment {
  issue_id: string | null;
  root_cause_hint: string | null;
  file_hint: string | null;
  stack_summary: string;
}

interface SentryFrame {
  function?: string;
  filename?: string;
  lineno?: number;
  in_app?: boolean;
}

// Sentry orders stack frames with the crashing frame LAST; the last in-app frame
// is the best culprit hint. Payload shape (error/issue webhook):
//   { data: { event: { exception: { values: [{ type, value, stacktrace: { frames } }] }, issue_id, title } } }
export function parseSentryEvent(payload: unknown): SentryEnrichment | null {
  const data = (payload as { data?: Record<string, unknown> })?.data ?? {};
  const event = (data.event ?? (data.issue as { event?: unknown })?.event ?? null) as
    | Record<string, unknown>
    | null;
  if (!event) return null;

  const values = ((event.exception as { values?: unknown })?.values ?? []) as {
    type?: string;
    value?: string;
    stacktrace?: { frames?: SentryFrame[] };
  }[];
  const frames: SentryFrame[] = values.flatMap((v) => v?.stacktrace?.frames ?? []);
  const inApp = frames.filter((f) => f?.in_app);
  const chosen = inApp.length ? inApp : frames;
  const top = chosen.length ? chosen[chosen.length - 1] : null;

  const issue_id =
    String(event.issue_id ?? (data.issue as { id?: unknown })?.id ?? '').trim() || null;

  const exc = values[0] ?? {};
  const header = `${exc.type ?? event.type ?? 'Error'}: ${exc.value ?? event.title ?? ''}`.trim();
  const frameLines = chosen
    .slice(-5)
    .map((f) => `  at ${f.function ?? '?'} (${f.filename ?? '?'}:${f.lineno ?? '?'})`);

  return {
    issue_id,
    root_cause_hint: top?.function ?? null,
    file_hint: top?.filename ?? null,
    stack_summary: [header, ...frameLines].join('\n'),
  };
}

// Latest-wins, consume-once handoff from the webhook handler to runDiagnosis.
// The webhook stashes enrichment immediately before triggering the chain, so the
// subsequent /diagnose picks it up. Fine for the single-flight demo flow.
let pending: SentryEnrichment | null = null;

export function stashSentryEnrichment(enrichment: SentryEnrichment): void {
  pending = enrichment;
}

export function takeSentryEnrichment(): SentryEnrichment | null {
  const e = pending;
  pending = null;
  return e;
}

export async function resolveSentryIssue(issueId: string, info: { pr_url?: string }): Promise<void> {
  if (!AUTH_TOKEN || !issueId) return;
  try {
    const res = await fetch(`https://sentry.io/api/0/issues/${issueId}/`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AUTH_TOKEN}` },
      body: JSON.stringify({ status: 'resolved' }),
    });
    log('sentry_resolved', { issue_id: issueId, status: res.status, pr_url: info.pr_url });
  } catch (err) {
    log('sentry_resolve_error', { error: String(err) });
  }
}

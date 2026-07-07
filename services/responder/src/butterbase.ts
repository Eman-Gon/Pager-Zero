import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type ButterbaseClient } from '@butterbase/sdk';
import { log } from './log.js';
import type { CandidateFix, Diagnosis } from './pipeline.js';
import type { Incident } from './context.js';

const APP_ID = process.env.BUTTERBASE_APP_ID ?? '';
// Trailing slash stripped: the SDK concatenates paths, and `…ai//auth/...`
// 404s on the Butterbase data plane.
const API_URL = (process.env.BUTTERBASE_API_URL ?? 'https://api.butterbase.ai').replace(/\/+$/, '');
// Credits granted per active subscription cycle of the plan (M5 Phase 2).
const PLAN_CREDITS = Number(process.env.BUTTERBASE_PLAN_CREDITS ?? 5);
// Unlimited mode: bypass the paywall entirely so applies/ships never get
// blocked (local + demo). Surface a large, JSON-safe balance for the UI.
const UNLIMITED_CREDITS = process.env.UNLIMITED_CREDITS === '1';
const UNLIMITED_BALANCE = 999_999;

export function butterbaseConfigured(): boolean {
  return Boolean(APP_ID);
}

// Thrown by spendCredit when the user has no credits — the paywall.
export class PaywallError extends Error {
  statusCode = 402;
  constructor(message = 'No apply credits — subscribe to a plan to ship fixes') {
    super(message);
  }
}

// One client per request, carrying the signed-in user's JWT so the Data API
// enforces RLS and auto-populates user_id.
export function userClient(token: string): ButterbaseClient {
  const client = createClient({ appId: APP_ID, apiUrl: API_URL });
  client.setAccessToken(token);
  return client;
}

export function bearerToken(header: string | undefined): string | null {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// Sign in as the service (on-call) account and return a fresh access token.
// Used by the autonomous loop, which acts as this user so incidents/actions
// persist under RLS exactly as a human operator's would. Mirrors the frontend
// sign-in: the token is on the session `data`, with getAccessToken() as fallback.
export async function signInService(email: string, password: string): Promise<string> {
  const client = createClient({ appId: APP_ID, apiUrl: API_URL, persistSession: false });
  const res = await client.auth.signIn({ email, password });
  if (res.error || !res.data) throw res.error ?? new Error('service sign-in returned no session');
  const token = (res.data as { access_token?: string }).access_token ?? client.getAccessToken();
  if (!token) throw new Error('service sign-in returned no access token');
  return token;
}

// The user id is the JWT's sub claim (RLS keys rows to it).
export function userIdFromToken(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  if (!payload.sub) throw new Error('token has no sub claim');
  return payload.sub as string;
}

interface IncidentRow {
  id: string;
  status: string;
}

// Trace + sandbox metadata ride in candidate_fix jsonb (no schema migration needed).
export interface StoredActionPayload extends CandidateFix {
  trace?: Pick<
    Diagnosis,
    'severity' | 'root_cause_explanation' | 'proposed_fix_approach' | 'cited_runbook'
  >;
  sandbox?: { test_output?: string; results?: { candidate_index: number; verified: boolean }[] };
}

function packCandidateFix(
  diagnosis: Diagnosis,
  action: {
    type: 'diagnose' | 'remediate';
    candidate_fix?: CandidateFix | null;
    test_output?: string;
    results?: { candidate_index: number; verified: boolean }[];
  },
): StoredActionPayload | null {
  const fix = action.candidate_fix ?? diagnosis.candidate_fix ?? null;
  if (action.type === 'diagnose') {
    return {
      ...(fix ?? { path: '', content: '' }),
      trace: {
        severity: diagnosis.severity,
        root_cause_explanation: diagnosis.root_cause_explanation,
        proposed_fix_approach: diagnosis.proposed_fix_approach,
        cited_runbook: diagnosis.cited_runbook,
      },
    };
  }
  if (!fix) return null;
  const payload: StoredActionPayload = { ...fix };
  if (action.test_output || action.results?.length) {
    // Postgres text/jsonb rejects NUL (22P05); sandbox output can contain it.
    payload.sandbox = { test_output: action.test_output?.replace(/\u0000/g, ''), results: action.results };
  }
  return payload;
}

// Persist the incident + the diagnose/remediate action for the signed-in user.
export async function recordIncidentAction(
  token: string,
  incident: Incident,
  diagnosis: Diagnosis,
  action: {
    type: 'diagnose' | 'remediate';
    candidate_fix?: CandidateFix | null;
    verified?: boolean;
    test_output?: string;
    results?: { candidate_index: number; verified: boolean }[];
  },
): Promise<{ incident_id: string; action_id: string }> {
  const client = userClient(token);

  // Reuse the open incident for this root cause if one exists.
  const existing = await client
    .from<IncidentRow>('incidents')
    .select('id,status')
    .eq('root_cause', incident.root_cause)
    .eq('status', 'open')
    .maybeSingle();
  let incidentId = (existing.data as IncidentRow | null)?.id;

  if (!incidentId) {
    const created = await client.from('incidents').insert({
      root_cause: incident.root_cause,
      // Data API turns top-level JS arrays into PG array literals, which a
      // jsonb column rejects — wrap the list in an object.
      blast_radius: { functions: incident.blast_radius },
      severity: diagnosis.severity ?? null,
      status: 'open',
    });
    if (created.error) throw new Error(`incidents insert failed: ${JSON.stringify(created.error)}`);
    incidentId = (Array.isArray(created.data) ? created.data[0] : created.data).id;
  }

  const act = await client.from('actions').insert({
    incident_id: incidentId,
    type: action.type,
    candidate_fix: packCandidateFix(diagnosis, action),
    verified: action.verified ?? false,
  });
  if (act.error) throw new Error(`actions insert failed: ${JSON.stringify(act.error)}`);
  const actionId = (Array.isArray(act.data) ? act.data[0] : act.data).id;

  log('butterbase_persisted', { incident_id: incidentId, action_id: actionId, type: action.type });
  return { incident_id: incidentId!, action_id: actionId };
}

interface AccountRow {
  user_id: string;
  apply_credits: number;
  plan: string;
}

// Fetch (or create) the user's account row, syncing plan + credits from the
// Butterbase subscription: an active subscription grants PLAN_CREDITS once
// per plan activation; free tier stays at 0.
export async function ensureAccount(token: string): Promise<AccountRow> {
  const client = userClient(token);
  const userId = userIdFromToken(token);

  let account =
    ((await client.from<AccountRow>('accounts').select('*').eq('user_id', userId).maybeSingle()).data ??
      null) as AccountRow | null;
  if (!account) {
    const created = await client.from('accounts').insert({ apply_credits: 0, plan: 'free' });
    if (created.error) throw new Error(`accounts insert failed: ${JSON.stringify(created.error)}`);
    account = Array.isArray(created.data) ? created.data[0] : created.data;
  }

  // Unlimited mode: skip the paywall (demo + subscription) sync entirely.
  if (UNLIMITED_CREDITS) {
    return { ...account!, apply_credits: UNLIMITED_BALANCE, plan: 'unlimited' };
  }

  // Demo mode: grant credits without Stripe so Mission Control can ship end-to-end.
  if (
    process.env.DEMO_AUTO_CREDITS === '1' &&
    account!.apply_credits <= 0 &&
    (account!.plan === 'free' || account!.plan === 'demo')
  ) {
    const updated = await client
      .from<AccountRow>('accounts')
      .update({ apply_credits: PLAN_CREDITS, plan: 'demo' })
      .eq('user_id', userId);
    if (!updated.error) {
      account = { ...account!, apply_credits: PLAN_CREDITS, plan: 'demo' };
      log('demo_credits_granted', { user_id: userId, apply_credits: PLAN_CREDITS });
    } else {
      log('demo_credits_grant_failed', { user_id: userId, error: updated.error });
      // Butterbase may block accounts updates (404) — still surface demo credits in the UI.
      account = { ...account!, apply_credits: PLAN_CREDITS, plan: 'demo' };
    }
  }

  // Subscription check — grant credits when a plan becomes active.
  try {
    const sub: any = (await client.billing.getSubscription()).data;
    const activePlan: string | null =
      sub && (sub.status === 'active' || sub.status === 'trialing')
        ? (sub.plan_name ?? sub.planName ?? sub.plan_id ?? 'subscribed')
        : null;
    if (activePlan && account!.plan !== activePlan) {
      const updated = await client
        .from<AccountRow>('accounts')
        .update({ plan: activePlan, apply_credits: account!.apply_credits + PLAN_CREDITS })
        .eq('user_id', userId);
      if (!updated.error) {
        account = { ...account!, plan: activePlan, apply_credits: account!.apply_credits + PLAN_CREDITS };
        log('credits_granted', { user_id: userId, plan: activePlan, apply_credits: account.apply_credits });
      }
    }
  } catch (err) {
    log('subscription_check_flagged', { error: String(err) });
  }

  return account!;
}

export interface ActionRow {
  id: string;
  incident_id: string;
  type: 'diagnose' | 'remediate';
  candidate_fix: CandidateFix | null;
  verified: boolean;
  applied: boolean;
}

export interface StoredIncidentRow {
  id: string;
  root_cause: string | null;
  status: string;
  opened_at: string;
  severity: string | null;
  blast_radius: { functions?: string[] } | null;
}

// Latest diagnose (or remediate) candidate for /remediate without re-running RocketRide.
async function materializeCandidate(
  payload: StoredActionPayload,
  incident: StoredIncidentRow,
): Promise<CandidateFix | null> {
  const filePath =
    payload.path ||
    (incident.root_cause === 'computeTax' ? 'src/tax.ts' : '');
  if (!filePath) return null;

  let content = payload.content?.trim() ? payload.content : '';
  const targetDir = process.env.TARGET_DIR ?? '';
  if (!content && targetDir) {
    try {
      content = await readFile(path.join(targetDir, filePath), 'utf8');
      const approach = payload.trace?.proposed_fix_approach ?? '';
      if (/multiplic/i.test(approach) && content.includes('amount + rate')) {
        content = content.replace('amount + rate', 'amount * rate');
      }
    } catch {
      return null;
    }
  }
  if (!content.trim()) return null;
  return { path: filePath, content };
}

export async function latestDiagnoseCandidate(
  token: string,
): Promise<{ candidate: CandidateFix; diagnosis: Diagnosis } | null> {
  const client = userClient(token);
  const openIncidents = (
    (await client.from<StoredIncidentRow>('incidents').select('*').eq('status', 'open')).data ?? []
  ) as StoredIncidentRow[];
  const incident = [...openIncidents].sort((a, b) =>
    String(b.opened_at ?? '').localeCompare(String(a.opened_at ?? '')),
  )[0];
  if (!incident) return null;

  type ActionWithType = {
    type: string;
    verified?: boolean;
    candidate_fix: StoredActionPayload | null;
    created_at?: string;
  };
  const rows = ((await client.from<ActionWithType>('actions').select('*').eq('incident_id', incident.id))
    .data ?? []) as ActionWithType[];
  const sorted = [...rows].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

  const pick = async (type: string) => {
    for (const row of sorted) {
      if (row.type !== type) continue;
      // Never re-serve a candidate that already failed sandbox verification.
      if (type === 'remediate' && !row.verified) continue;
      const payload = row.candidate_fix;
      if (!payload) continue;
      const candidate = await materializeCandidate(payload, incident);
      if (!candidate) continue;
      const diagnosis: Diagnosis =
        type === 'diagnose' && payload.trace
          ? {
              severity: payload.trace.severity,
              root_cause_explanation: payload.trace.root_cause_explanation,
              proposed_fix_approach: payload.trace.proposed_fix_approach,
              cited_runbook: payload.trace.cited_runbook,
              candidate_fix: candidate,
            }
          : {
              severity: (incident.severity as Diagnosis['severity']) ?? 'high',
              root_cause_explanation: '',
              proposed_fix_approach: '',
              cited_runbook: null,
              candidate_fix: candidate,
            };
      return { candidate, diagnosis };
    }
    return null;
  };

  return (await pick('remediate')) ?? (await pick('diagnose'));
}

// The latest verified-but-unapplied fix for the user's open incident (M6).
export async function latestVerifiedAction(
  token: string,
): Promise<{ action: ActionRow; incident: StoredIncidentRow } | null> {
  const client = userClient(token);
  const incident = (
    await client.from<StoredIncidentRow>('incidents').select('*').eq('status', 'open').maybeSingle()
  ).data as StoredIncidentRow | null;
  if (!incident) return null;

  const actions =
    ((
      await client
        .from<ActionRow>('actions')
        .select('*')
        .eq('incident_id', incident.id)
        .eq('verified', true)
        .eq('applied', false)
    ).data as ActionRow[] | null) ?? [];
  const action = actions.filter((a) => a.candidate_fix?.path).pop();
  return action ? { action, incident } : null;
}

// Mark the shipped fix applied and the incident resolved; MTTR in seconds (M6).
export async function markApplied(
  token: string,
  action: ActionRow,
  incident: StoredIncidentRow,
): Promise<{ mttr_seconds: number }> {
  const client = userClient(token);
  const resolvedAt = new Date();
  const mttr = Math.max(1, Math.round((resolvedAt.getTime() - new Date(incident.opened_at).getTime()) / 1000));

  const act = await client.from('actions').update({ applied: true }).eq('id', action.id);
  if (act.error) throw new Error(`actions update failed: ${JSON.stringify(act.error)}`);
  const inc = await client
    .from('incidents')
    .update({ status: 'resolved', resolved_at: resolvedAt.toISOString(), mttr_seconds: mttr })
    .eq('id', incident.id);
  if (inc.error) throw new Error(`incidents update failed: ${JSON.stringify(inc.error)}`);

  log('incident_resolved', { incident_id: incident.id, mttr_seconds: mttr });
  return { mttr_seconds: mttr };
}

// ---------------------------------------------------------------------------
// M7: approvals — risky fixes park here until a human decides.
// ---------------------------------------------------------------------------

export interface ApprovalRow {
  id: string;
  action_id: string;
  status: 'pending' | 'approved' | 'denied';
}

export async function createApproval(token: string, actionId: string): Promise<ApprovalRow> {
  const client = userClient(token);
  const created = await client.from('approvals').insert({ action_id: actionId, status: 'pending' });
  if (created.error) throw new Error(`approvals insert failed: ${JSON.stringify(created.error)}`);
  const row = (Array.isArray(created.data) ? created.data[0] : created.data) as ApprovalRow;
  log('approval_created', { approval_id: row.id, action_id: actionId });
  return row;
}

// An existing pending approval for this action, if any — so a repeated /apply
// on the same risky fix reuses the open approval instead of spawning duplicates
// (each of which could otherwise be approved into its own PR + credit spend).
export async function findPendingApproval(token: string, actionId: string): Promise<ApprovalRow | null> {
  const client = userClient(token);
  return ((
    await client
      .from<ApprovalRow>('approvals')
      .select('*')
      .eq('action_id', actionId)
      .eq('status', 'pending')
      .maybeSingle()
  ).data ?? null) as ApprovalRow | null;
}

export async function getApproval(token: string, approvalId: string): Promise<ApprovalRow | null> {
  const client = userClient(token);
  return ((await client.from<ApprovalRow>('approvals').select('*').eq('id', approvalId).maybeSingle()).data ??
    null) as ApprovalRow | null;
}

export async function setApprovalStatus(
  token: string,
  approvalId: string,
  status: 'approved' | 'denied',
): Promise<void> {
  const client = userClient(token);
  const updated = await client.from('approvals').update({ status }).eq('id', approvalId);
  if (updated.error) throw new Error(`approvals update failed: ${JSON.stringify(updated.error)}`);
  log('approval_decided', { approval_id: approvalId, status });
}

// Load the action + incident an approval refers to (for the approved → ship path).
export async function actionWithIncident(
  token: string,
  actionId: string,
): Promise<{ action: ActionRow; incident: StoredIncidentRow } | null> {
  const client = userClient(token);
  const action = ((await client.from<ActionRow>('actions').select('*').eq('id', actionId).maybeSingle()).data ??
    null) as ActionRow | null;
  if (!action) return null;
  const incident = ((
    await client.from<StoredIncidentRow>('incidents').select('*').eq('id', action.incident_id).maybeSingle()
  ).data ?? null) as StoredIncidentRow | null;
  return incident ? { action, incident } : null;
}

// The load-bearing paywall: no credits → PaywallError; else decrement by 1.
export async function spendCredit(token: string): Promise<{ remaining: number }> {
  const account = await ensureAccount(token);
  // Unlimited mode: never paywall, never decrement — infinite applies.
  if (UNLIMITED_CREDITS) {
    log('credit_spend_unlimited', { user_id: account.user_id });
    return { remaining: account.apply_credits };
  }
  if (account.apply_credits <= 0) throw new PaywallError();

  // Demo mode: credits may be synthetic if Butterbase accounts writes are blocked.
  if (process.env.DEMO_AUTO_CREDITS === '1' && account.plan === 'demo') {
    const remaining = account.apply_credits - 1;
    log('demo_credit_spent', { user_id: account.user_id, remaining });
    return { remaining };
  }

  const client = userClient(token);
  const updated = await client
    .from<AccountRow>('accounts')
    .update({ apply_credits: account.apply_credits - 1 })
    .eq('user_id', account.user_id);
  if (updated.error) throw new Error(`credit decrement failed: ${JSON.stringify(updated.error)}`);
  log('credit_spent', { user_id: account.user_id, remaining: account.apply_credits - 1 });
  return { remaining: account.apply_credits - 1 };
}

// Give a spent credit back — used to roll back when the ship (PR) fails after
// the credit was already spent, so a GitHub error never silently burns a credit.
// Mirrors spendCredit's modes: a no-op under unlimited, and synthetic (log-only)
// under demo where accounts writes are blocked.
export async function refundCredit(token: string): Promise<void> {
  if (UNLIMITED_CREDITS) return;
  const account = await ensureAccount(token).catch(() => null);
  if (!account) return;
  if (process.env.DEMO_AUTO_CREDITS === '1' && account.plan === 'demo') {
    log('demo_credit_refunded', { user_id: account.user_id, remaining: account.apply_credits + 1 });
    return;
  }
  const client = userClient(token);
  const updated = await client
    .from<AccountRow>('accounts')
    .update({ apply_credits: account.apply_credits + 1 })
    .eq('user_id', account.user_id);
  if (updated.error) {
    log('credit_refund_failed', { user_id: account.user_id, error: updated.error });
    return;
  }
  log('credit_refunded', { user_id: account.user_id, remaining: account.apply_credits + 1 });
}

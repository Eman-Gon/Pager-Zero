import { createClient, type ButterbaseClient } from '@butterbase/sdk';
import { log } from './log.js';
import type { CandidateFix, Diagnosis } from './pipeline.js';
import type { Incident } from './context.js';

const APP_ID = process.env.BUTTERBASE_APP_ID ?? '';
const API_URL = process.env.BUTTERBASE_API_URL ?? 'https://api.butterbase.ai';
// Credits granted per active subscription cycle of the plan (M5 Phase 2).
const PLAN_CREDITS = Number(process.env.BUTTERBASE_PLAN_CREDITS ?? 5);

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
    payload.sandbox = { test_output: action.test_output, results: action.results };
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

  // Demo mode: grant credits without Stripe so Mission Control can ship end-to-end.
  if (
    process.env.DEMO_AUTO_CREDITS === '1' &&
    account!.apply_credits <= 0 &&
    account!.plan === 'free'
  ) {
    const updated = await client
      .from<AccountRow>('accounts')
      .update({ apply_credits: PLAN_CREDITS, plan: 'demo' })
      .eq('user_id', userId);
    if (!updated.error) {
      account = { ...account!, apply_credits: PLAN_CREDITS, plan: 'demo' };
      log('demo_credits_granted', { user_id: userId, apply_credits: PLAN_CREDITS });
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
  if (account.apply_credits <= 0) throw new PaywallError();

  const client = userClient(token);
  const updated = await client
    .from<AccountRow>('accounts')
    .update({ apply_credits: account.apply_credits - 1 })
    .eq('user_id', account.user_id);
  if (updated.error) throw new Error(`credit decrement failed: ${JSON.stringify(updated.error)}`);
  log('credit_spent', { user_id: account.user_id, remaining: account.apply_credits - 1 });
  return { remaining: account.apply_credits - 1 };
}

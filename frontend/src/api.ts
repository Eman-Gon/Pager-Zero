import { createClient, type ButterbaseClient } from '@butterbase/sdk';

export const APP_ID = import.meta.env.VITE_BUTTERBASE_APP_ID ?? 'app_gsuwgmmbc74g';
export const BB_API_URL = import.meta.env.VITE_BUTTERBASE_API_URL ?? 'https://api.butterbase.ai';
const SENSOR = import.meta.env.VITE_SENSOR_URL ?? '/sensor';
const RESPONDER = import.meta.env.VITE_RESPONDER_URL ?? '/responder';

export const butterbase: ButterbaseClient = createClient({ appId: APP_ID, apiUrl: BB_API_URL });

export interface Incident {
  status: 'ok' | 'incident';
  failing_tests: string[];
  changed_functions: string[];
  root_cause: string | null;
  blast_radius: string[];
}

export interface Diagnosis {
  severity: 'low' | 'medium' | 'high';
  root_cause_explanation: string;
  proposed_fix_approach: string;
  cited_runbook: string | null;
  candidate_fix?: { path: string; content: string };
}

export interface StoredActionPayload {
  path?: string;
  content?: string;
  trace?: Diagnosis;
  sandbox?: {
    test_output?: string;
    results?: { candidate_index: number; verified: boolean }[];
  };
}

export interface ActionRow {
  id: string;
  incident_id: string;
  type: 'diagnose' | 'remediate';
  candidate_fix: StoredActionPayload | null;
  verified: boolean;
  applied: boolean;
  created_at?: string;
}

export interface AccountRow {
  user_id: string;
  apply_credits: number;
  plan: string;
}

export async function fetchIncident(): Promise<Incident> {
  const res = await fetch(`${SENSOR}/incident`);
  if (!res.ok) throw new Error(`sensor ${res.status}`);
  return res.json();
}

export interface HealthStatus {
  sensor: boolean;
  neo4j: boolean;
  rocketride: { connected: boolean; transport: string; uri: string; pipeline?: string };
  butterbase: boolean;
  tools: {
    daytona: boolean;
    github: boolean;
    nebius: boolean;
    rocketride: boolean;
    opsera?: boolean;
  };
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch(`${RESPONDER}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

async function responderPost(path: string, token: string, body?: unknown): Promise<{ status: number; data: any }> {
  let res: Response;
  try {
    res = await fetch(`${RESPONDER}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      msg === 'Load failed' || msg === 'Failed to fetch'
        ? 'responder unreachable or timed out — check ./scripts/dev-native.sh status and retry'
        : msg,
    );
  }
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export const diagnose = (token: string) => responderPost('/diagnose', token);
export const remediate = (token: string) => responderPost('/remediate', token);
export const apply = (token: string) => responderPost('/apply', token);
export const decideApproval = (token: string, id: string, decision: 'approved' | 'denied') =>
  responderPost(`/approvals/${id}`, token, { decision });

export async function syncAccount(token: string): Promise<AccountRow> {
  const res = await fetch(`${RESPONDER}/account`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`account sync ${res.status}`);
  return res.json();
}

// Latest persisted diagnose/remediate rows for the user's open incident.
export async function fetchPersistedActions(token: string): Promise<{
  diagnose: ActionRow | null;
  remediate: ActionRow | null;
}> {
  butterbase.setAccessToken(token);
  const incRes = await butterbase.from<{ id: string }>('incidents').select('id').eq('status', 'open').maybeSingle();
  const incidentId = (incRes.data as { id: string } | null)?.id;
  if (!incidentId) return { diagnose: null, remediate: null };

  const actRes = await butterbase
    .from<ActionRow>('actions')
    .select('*')
    .eq('incident_id', incidentId);
  const actions = ((actRes.data ?? []) as ActionRow[]).sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
  );

  return {
    diagnose: actions.find((a) => a.type === 'diagnose') ?? null,
    remediate: actions.find((a) => a.type === 'remediate') ?? null,
  };
}

export interface StoredIncidentRow {
  id: string;
  root_cause: string | null;
  status: string;
  severity: string | null;
  blast_radius?: { functions?: string[] } | null;
  opened_at: string;
  resolved_at: string | null;
  mttr_seconds: number | null;
}

export interface ApprovalRow {
  id: string;
  action_id: string;
  status: 'pending' | 'approved' | 'denied';
  created_at?: string;
}

export interface MissionStats {
  incidents_total: number;
  incidents_open: number;
  incidents_resolved: number;
  diagnoses: number;
  remediates: number;
  remediates_verified: number;
  approvals_pending: number;
  avg_mttr_seconds: number | null;
}

export interface PipelineProgress {
  has_diagnose: boolean;
  has_verified_fix: boolean;
  approval_pending: boolean;
  approval_denied: boolean;
  shipped: boolean;
  severity: string | null;
}

export interface MissionSnapshot {
  health: HealthStatus;
  account: AccountRow | null;
  live: Incident | null;
  stats: MissionStats;
  openIncident: StoredIncidentRow | null;
  pipeline: PipelineProgress;
}

export async function fetchMissionSnapshot(token: string): Promise<MissionSnapshot> {
  butterbase.setAccessToken(token);
  const [health, live, accountRes, incRes, actRes, apprRes] = await Promise.all([
    fetchHealth(),
    fetchIncident().catch(() => null),
    syncAccount(token).catch(() => null),
    butterbase.from<StoredIncidentRow>('incidents').select('*'),
    butterbase.from<ActionRow>('actions').select('*'),
    butterbase.from<ApprovalRow>('approvals').select('*'),
  ]);

  const incidents = ((incRes.data ?? []) as StoredIncidentRow[]) ?? [];
  const actions = ((actRes.data ?? []) as ActionRow[]) ?? [];
  const approvals = ((apprRes.data ?? []) as ApprovalRow[]) ?? [];

  const resolved = incidents.filter((i) => i.status === 'resolved');
  const mttrs = resolved.map((i) => i.mttr_seconds).filter((n): n is number => n != null && n > 0);
  const openIncident = incidents.find((i) => i.status === 'open') ?? null;
  const openActions = openIncident ? actions.filter((a) => a.incident_id === openIncident.id) : [];
  const verifiedFix = openActions.find((a) => a.type === 'remediate' && a.verified && a.candidate_fix?.path);
  const diagnoseAction = openActions.find((a) => a.type === 'diagnose' && a.candidate_fix?.trace);
  const openApprovals = verifiedFix
    ? approvals.filter((a) => a.action_id === verifiedFix.id)
    : [];
  const pendingApproval = openApprovals.some((a) => a.status === 'pending');
  const deniedApproval =
    openApprovals.some((a) => a.status === 'denied') && !pendingApproval;

  return {
    health,
    account: accountRes,
    live,
    stats: {
      incidents_total: incidents.length,
      incidents_open: incidents.filter((i) => i.status === 'open').length,
      incidents_resolved: resolved.length,
      diagnoses: actions.filter((a) => a.type === 'diagnose').length,
      remediates: actions.filter((a) => a.type === 'remediate').length,
      remediates_verified: actions.filter((a) => a.type === 'remediate' && a.verified).length,
      approvals_pending: approvals.filter((a) => a.status === 'pending').length,
      avg_mttr_seconds: mttrs.length ? Math.round(mttrs.reduce((s, n) => s + n, 0) / mttrs.length) : null,
    },
    openIncident,
    pipeline: {
      has_diagnose: Boolean(diagnoseAction?.candidate_fix?.trace),
      has_verified_fix: Boolean(verifiedFix),
      approval_pending: pendingApproval,
      approval_denied: deniedApproval,
      shipped: openIncident?.status === 'resolved' || openActions.some((a) => a.applied),
      severity: diagnoseAction?.candidate_fix?.trace?.severity ?? openIncident?.severity ?? null,
    },
  };
}

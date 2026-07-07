import { useEffect, useState } from 'react';
import { ActionProgress, ResultBadge } from '../components/ActionProgress';
import { butterbase, decideApproval, type ActionRow, type StoredIncidentRow } from '../api';

const SHIP_STEPS = [
  { id: 'policy', label: 'Policy', detail: 'Confirm approval granted' },
  { id: 'credit', label: 'Credits', detail: 'Spend apply credit' },
  { id: 'github', label: 'GitHub', detail: 'Open fix PR' },
  { id: 'resolve', label: 'Resolve', detail: 'Close incident + MTTR' },
];

interface ApprovalRow {
  id: string;
  action_id: string;
  status: string;
  created_at: string;
}

interface ApprovalContext {
  root_cause: string | null;
  severity: string | null;
  summary: string | null;
  fix_path: string | null;
  blast_radius: string[];
}

function describeApproval(
  actionId: string,
  actions: ActionRow[],
  incidents: StoredIncidentRow[],
): ApprovalContext | null {
  const action = actions.find((a) => a.id === actionId);
  if (!action) return null;
  const incident = incidents.find((i) => i.id === action.incident_id);
  const trace = action.candidate_fix?.trace;
  const blast =
    incident?.blast_radius && typeof incident.blast_radius === 'object' && 'functions' in incident.blast_radius
      ? (incident.blast_radius as { functions?: string[] }).functions ?? []
      : [];
  return {
    root_cause: incident?.root_cause ?? null,
    severity: trace?.severity ?? incident?.severity ?? null,
    summary: trace?.root_cause_explanation ?? trace?.proposed_fix_approach ?? null,
    fix_path: action.candidate_fix?.path ?? trace?.candidate_fix?.path ?? null,
    blast_radius: blast,
  };
}

function ApprovalId({ id, context }: { id: string; context: ApprovalContext | null }) {
  const label = id.slice(0, 8);
  if (!context?.summary && !context?.root_cause) {
    return <code title="Approval ID">{label}</code>;
  }
  return (
    <span className="approval-id-wrap">
      <code tabIndex={0} aria-describedby={`approval-tip-${id}`}>
        {label}
      </code>
      <div className="approval-popover" id={`approval-tip-${id}`} role="tooltip">
        {context.root_cause && (
          <div className="approval-popover-title">{context.root_cause}</div>
        )}
        {context.severity && (
          <span className={`sev sev-${context.severity}`}>{context.severity}</span>
        )}
        {context.summary && (
          <p className="approval-popover-body">
            {context.summary.length > 160 ? `${context.summary.slice(0, 157)}…` : context.summary}
          </p>
        )}
        {context.fix_path && (
          <div className="approval-popover-meta">
            Fix: <code>{context.fix_path}</code>
          </div>
        )}
        {context.blast_radius.length > 0 && (
          <div className="approval-popover-meta muted">
            Blast: {context.blast_radius.join(', ')}
          </div>
        )}
      </div>
    </span>
  );
}

export default function ApprovalPanel({
  token,
  tick,
  onChanged,
}: {
  token: string;
  tick: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [incidents, setIncidents] = useState<StoredIncidentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<'approved' | 'denied' | null>(null);
  const [shipped, setShipped] = useState<{ pr_url?: string; mttr_seconds?: number } | null>(null);

  useEffect(() => {
    butterbase.setAccessToken(token);
    Promise.all([
      butterbase.from<ApprovalRow>('approvals').select('*'),
      butterbase.from<ActionRow>('actions').select('*'),
      butterbase.from<StoredIncidentRow>('incidents').select('*'),
    ]).then(([apprRes, actRes, incRes]) => {
      if (apprRes.error) setError(JSON.stringify(apprRes.error));
      else setRows((apprRes.data ?? []) as ApprovalRow[]);
      setActions((actRes.data ?? []) as ActionRow[]);
      setIncidents((incRes.data ?? []) as StoredIncidentRow[]);
    });
  }, [token, tick]);

  async function decide(id: string, decision: 'approved' | 'denied') {
    setBusy(id);
    setBusyDecision(decision);
    setError(null);
    setShipped(null);
    try {
      const { status, data } = await decideApproval(token, id, decision);
      if (status === 402) setError('payment required — subscribe to ship this fix');
      else if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      else if (decision === 'approved' && data.pr_url) {
        setShipped({ pr_url: data.pr_url, mttr_seconds: data.mttr_seconds });
      }
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
      setBusyDecision(null);
    }
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <div className="panel-stack">
      {error && <div className="err">{error}</div>}

      {busy && busyDecision === 'approved' && (
        <ActionProgress steps={SHIP_STEPS} active title="Approve & ship" />
      )}

      {shipped?.pr_url && (
        <div className="result-card result-card-ok">
          <ResultBadge kind="ok">PR opened</ResultBadge>
          <a className="pr-link" href={shipped.pr_url} target="_blank" rel="noreferrer">
            {shipped.pr_url}
          </a>
          {shipped.mttr_seconds != null && (
            <span className="muted"> · MTTR {shipped.mttr_seconds}s</span>
          )}
        </div>
      )}

      {pending.length === 0 && !busy && <div className="muted panel-hint">No fixes waiting for approval.</div>}

      {pending.map((r) => (
        <div key={r.id} className="approval-card">
          <ApprovalId id={r.id} context={describeApproval(r.action_id, actions, incidents)} />
          <div className="approval-actions">
            <button className="good" disabled={!!busy} onClick={() => decide(r.id, 'approved')}>
              {busy === r.id && busyDecision === 'approved' ? 'Shipping…' : 'Approve & ship'}
            </button>
            <button className="danger" disabled={!!busy} onClick={() => decide(r.id, 'denied')}>
              {busy === r.id && busyDecision === 'denied' ? 'Denying…' : 'Deny'}
            </button>
          </div>
        </div>
      ))}

      {decided.length > 0 && (
        <details className="approval-history">
          <summary className="muted">{decided.length} past decision(s)</summary>
          {decided.map((r) => (
            <div key={r.id} className="approval-history-row">
              <ApprovalId id={r.id} context={describeApproval(r.action_id, actions, incidents)} />
              <ResultBadge kind={r.status === 'approved' ? 'ok' : 'bad'}>{r.status}</ResultBadge>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

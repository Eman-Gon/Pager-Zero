import { useEffect, useState } from 'react';
import { ActionProgress, ResultBadge } from '../components/ActionProgress';
import { butterbase, decideApproval } from '../api';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<'approved' | 'denied' | null>(null);
  const [shipped, setShipped] = useState<{ pr_url?: string; mttr_seconds?: number } | null>(null);

  useEffect(() => {
    butterbase.setAccessToken(token);
    butterbase
      .from<ApprovalRow>('approvals')
      .select('*')
      .then((res: any) => {
        if (res.error) setError(JSON.stringify(res.error));
        else setRows((res.data ?? []) as ApprovalRow[]);
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
          <code>{r.id.slice(0, 8)}</code>
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
              <code>{r.id.slice(0, 8)}</code>
              <ResultBadge kind={r.status === 'approved' ? 'ok' : 'bad'}>{r.status}</ResultBadge>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

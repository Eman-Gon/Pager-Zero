import { useEffect, useState } from 'react';
import { ActionProgress, ResultBadge } from '../components/ActionProgress';
import { apply, butterbase } from '../api';

const APPLY_STEPS = [
  { id: 'policy', label: 'Policy', detail: 'Check severity + blast radius' },
  { id: 'approval', label: 'Gate', detail: 'Route to human approval if needed' },
  { id: 'credit', label: 'Credits', detail: 'Spend apply credit' },
  { id: 'github', label: 'GitHub', detail: 'Open fix PR' },
];

interface IncidentRow {
  id: string;
  root_cause: string | null;
  status: string;
  opened_at: string;
  resolved_at: string | null;
  mttr_seconds: number | null;
}

export default function ShipPanel({
  token,
  tick,
  onChanged,
}: {
  token: string;
  tick: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipped, setShipped] = useState<{ pr_url: string; mttr_seconds: number } | null>(null);
  const [pendingApproval, setPendingApproval] = useState<string | null>(null);

  useEffect(() => {
    butterbase.setAccessToken(token);
    butterbase
      .from<IncidentRow>('incidents')
      .select('*')
      .then((res: any) => {
        if (!res.error) setRows((res.data ?? []) as IncidentRow[]);
      });
  }, [token, tick]);

  async function ship() {
    setBusy(true);
    setDone(false);
    setError(null);
    setPendingApproval(null);
    setShipped(null);
    try {
      const { status, data } = await apply(token);
      if (status === 402) setError('payment required — subscribe below to ship fixes');
      else if (status === 409) setError(data.error);
      else if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      else if (data.status === 'pending_approval') {
        setPendingApproval(data.reasons?.join('; ') ?? data.approval_id);
        setDone(true);
      } else {
        setShipped(data);
        setDone(true);
      }
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <div className="row panel-actions">
        <button disabled={busy} onClick={ship}>
          {busy ? 'Shipping…' : 'Apply fix (opens PR)'}
        </button>
        {shipped && !busy && <ResultBadge kind="ok">shipped</ResultBadge>}
      </div>

      <ActionProgress
        steps={APPLY_STEPS}
        active={busy}
        done={done && !error}
        error={!!error}
        title="Ship fix"
      />

      {error && <div className="err">{error}</div>}

      {pendingApproval && (
        <div className="result-card result-card-warn">
          <ResultBadge kind="warn">gated for approval</ResultBadge>
          <p>{pendingApproval}</p>
          <p className="muted panel-hint">Use the Approvals panel to Approve &amp; ship.</p>
        </div>
      )}

      {shipped && (
        <div className="result-card result-card-ok">
          <ResultBadge kind="ok">PR opened</ResultBadge>
          <a className="pr-link" href={shipped.pr_url} target="_blank" rel="noreferrer">
            {shipped.pr_url}
          </a>
          <span className="muted"> · MTTR {shipped.mttr_seconds}s</span>
        </div>
      )}

      <div className="incident-list">
        {rows.map((r) => (
          <div key={r.id} className="incident-row">
            <code>{r.root_cause ?? 'incident'}</code>
            <ResultBadge kind={r.status === 'resolved' ? 'ok' : 'warn'}>{r.status}</ResultBadge>
            {r.mttr_seconds !== null && <span className="muted">MTTR {r.mttr_seconds}s</span>}
          </div>
        ))}
        {rows.length === 0 && <div className="muted panel-hint">No incidents recorded yet.</div>}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { apply, butterbase } from '../api';

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
    setError(null);
    setPendingApproval(null);
    try {
      const { status, data } = await apply(token);
      if (status === 402) setError('payment required — subscribe below to ship fixes');
      else if (status === 409) setError(data.error);
      else if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      else if (data.status === 'pending_approval') setPendingApproval(data.reasons?.join('; ') ?? data.approval_id);
      else setShipped(data);
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <button disabled={busy} onClick={ship}>
          {busy ? 'Shipping…' : 'Apply fix (opens PR)'}
        </button>
      </div>
      {error && <div className="err">{error}</div>}
      {pendingApproval && <div className="kv sev-medium">⏸ gated for approval: {pendingApproval}</div>}
      {shipped && (
        <div className="kv sev-low">
          ✓ shipped —{' '}
          <a href={shipped.pr_url} target="_blank" rel="noreferrer">
            {shipped.pr_url}
          </a>{' '}
          · MTTR {shipped.mttr_seconds}s
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        {rows.map((r) => (
          <div key={r.id} className="kv">
            <b>{r.root_cause ?? 'incident'}</b>
            <span className={r.status === 'resolved' ? 'sev-low' : 'sev-medium'}>{r.status}</span>
            {r.mttr_seconds !== null && <span className="muted"> · MTTR {r.mttr_seconds}s</span>}
          </div>
        ))}
        {rows.length === 0 && <div className="muted">No incidents recorded yet.</div>}
      </div>
    </div>
  );
}

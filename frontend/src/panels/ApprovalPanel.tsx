import { useEffect, useState } from 'react';
import { butterbase, decideApproval } from '../api';

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
    setError(null);
    try {
      const { status, data } = await decideApproval(token, id, decision);
      if (status === 402) setError('payment required — subscribe to ship this fix');
      else if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {pending.length === 0 && <div className="muted">No fixes waiting for approval.</div>}
      {pending.map((r) => (
        <div key={r.id} className="row" style={{ margin: '6px 0' }}>
          <span>
            approval <b>{r.id.slice(0, 8)}</b>
          </span>
          <button className="good" disabled={busy === r.id} onClick={() => decide(r.id, 'approved')}>
            Approve &amp; ship
          </button>
          <button className="danger" disabled={busy === r.id} onClick={() => decide(r.id, 'denied')}>
            Deny
          </button>
        </div>
      ))}
      {decided.length > 0 && (
        <div className="muted" style={{ marginTop: 8 }}>
          {decided.map((r) => (
            <div key={r.id}>
              {r.id.slice(0, 8)} → {r.status}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

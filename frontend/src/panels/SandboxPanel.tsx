import { useEffect, useState } from 'react';
import { fetchPersistedActions, remediate, type ActionRow, type Incident } from '../api';

interface RemediateResult {
  verified: boolean;
  test_output: string;
  selected?: number | null;
  results?: { candidate_index: number; verified: boolean }[];
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function sandboxFromAction(row: ActionRow | null): RemediateResult | null {
  if (!row || row.type !== 'remediate') return null;
  const sandbox = row.candidate_fix?.sandbox;
  if (!sandbox?.test_output && !row.verified) return null;
  return {
    verified: row.verified,
    test_output: sandbox?.test_output ?? '(verified - re-run remediate to refresh output)',
    results: sandbox?.results,
  };
}

export default function SandboxPanel({
  token,
  incident,
  tick,
  onChanged,
}: {
  token: string;
  incident: Incident | null;
  tick: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemediateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPersistedActions(token)
      .then(({ remediate: row }) => {
        if (!alive) return;
        const sandbox = sandboxFromAction(row);
        if (sandbox) {
          setResult(sandbox);
          setRestored(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, tick]);

  async function run() {
    setBusy(true);
    setError(null);
    setRestored(false);
    try {
      const { status, data } = await remediate(token);
      if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      if (data.status === 'ok') {
        setError('no incident - nothing to remediate');
      } else {
        setResult({
          verified: data.verified,
          test_output: data.test_output ?? '',
          selected: data.selected,
          results: data.results,
        });
        onChanged();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <button disabled={busy || incident?.status !== 'incident'} onClick={run}>
          {busy ? 'Verifying in Daytona...' : 'Remediate (verify in sandbox)'}
        </button>
        {result && (
          <span className={result.verified ? 'sev-low' : 'sev-high'}>
            {result.verified ? 'verified' : 'rejected'}
          </span>
        )}
        {restored && result && <span className="muted">restored from Butterbase</span>}
      </div>
      {error && <div className="err">{error}</div>}
      {result?.results && (
        <div className="kv">
          <b>candidates</b>
          {result.results.map((r) => (
            <span key={r.candidate_index} className={r.verified ? 'sev-low' : 'sev-high'} style={{ marginRight: 8 }}>
              #{r.candidate_index} {r.verified ? 'pass' : 'fail'}
            </span>
          ))}
        </div>
      )}
      {result && <pre className="out">{stripAnsi(result.test_output)}</pre>}
      {!result && !error && <div className="muted">Run remediation to prove the fix against the real test suite.</div>}
    </div>
  );
}

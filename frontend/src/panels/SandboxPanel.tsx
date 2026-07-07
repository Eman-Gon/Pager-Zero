import { useState } from 'react';
import { remediate, type Incident } from '../api';

interface RemediateResult {
  verified: boolean;
  test_output: string;
  selected?: number | null;
  results?: { candidate_index: number; verified: boolean }[];
}

const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');

export default function SandboxPanel({
  token,
  incident,
  onChanged,
}: {
  token: string;
  incident: Incident | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemediateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { status, data } = await remediate(token);
      if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      if (data.status === 'ok') {
        setError('no incident — nothing to remediate');
      } else {
        setResult(data);
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
          {busy ? 'Verifying in Daytona…' : 'Remediate (verify in sandbox)'}
        </button>
        {result && (
          <span className={result.verified ? 'sev-low' : 'sev-high'}>
            {result.verified ? '✓ verified' : '✗ rejected'}
          </span>
        )}
      </div>
      {error && <div className="err">{error}</div>}
      {result?.results && (
        <div className="kv">
          <b>candidates</b>
          {result.results.map((r) => (
            <span key={r.candidate_index} className={r.verified ? 'sev-low' : 'sev-high'} style={{ marginRight: 8 }}>
              #{r.candidate_index} {r.verified ? '✓' : '✗'}
            </span>
          ))}
        </div>
      )}
      {result && <pre className="out">{stripAnsi(result.test_output)}</pre>}
      {!result && !error && <div className="muted">Run remediation to prove the fix against the real test suite.</div>}
    </div>
  );
}

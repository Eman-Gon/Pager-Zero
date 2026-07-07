import { useEffect, useState } from 'react';
import { ActionProgress, ResultBadge } from '../components/ActionProgress';
import TerminalOut from '../components/TerminalOut';
import { fetchPersistedActions, remediate, type ActionRow, type Incident } from '../api';

const REMEDIATE_STEPS = [
  { id: 'load', label: 'Candidate', detail: 'Load fix from diagnose trace' },
  { id: 'pack', label: 'Pack repo', detail: 'Tar target-repo for upload' },
  { id: 'sandbox', label: 'Daytona', detail: 'Create cloud sandbox' },
  { id: 'install', label: 'Install', detail: 'npm install in sandbox' },
  { id: 'test', label: 'Verify', detail: 'Apply patch + npm test' },
  { id: 'persist', label: 'Butterbase', detail: 'Save sandbox output' },
];

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
    test_output: sandbox?.test_output ?? '',
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
  const [done, setDone] = useState(false);
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
          setDone(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, tick]);

  async function run() {
    setBusy(true);
    setDone(false);
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
        setDone(true);
        onChanged();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <div className="row panel-actions">
        <button disabled={busy || incident?.status !== 'incident'} onClick={run}>
          {busy ? 'Verifying?' : 'Remediate (verify in sandbox)'}
        </button>
        {result && !busy && (
          <ResultBadge kind={result.verified ? 'ok' : 'bad'}>{result.verified ? 'tests passed' : 'tests failed'}</ResultBadge>
        )}
        {restored && result && !busy && <ResultBadge kind="info">restored from Butterbase</ResultBadge>}
      </div>

      <ActionProgress
        steps={REMEDIATE_STEPS}
        active={busy}
        done={done && !!result && !error}
        error={!!error}
        title="Daytona sandbox verify"
      />

      {error && <div className="err">{error}</div>}

      {result?.results && !busy && (
        <div className="candidate-chips">
          {result.results.map((r) => (
            <ResultBadge key={r.candidate_index} kind={r.verified ? 'ok' : 'bad'}>
              candidate #{r.candidate_index} {r.verified ? 'pass' : 'fail'}
            </ResultBadge>
          ))}
        </div>
      )}

      {result && !busy && (
        <TerminalOut
          title="vitest output"
          lines={stripAnsi(result.test_output) || '(verified ? re-run remediate to refresh output)'}
          variant={result.verified ? 'ok' : 'bad'}
        />
      )}

      {!result && !error && !busy && (
        <div className="muted panel-hint">Run remediation to prove the fix against the real test suite.</div>
      )}
    </div>
  );
}

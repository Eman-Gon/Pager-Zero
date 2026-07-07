import { useCallback, useEffect, useState } from 'react';
import { butterbase, fetchIncident, type Incident } from './api';
import ApprovalPanel from './panels/ApprovalPanel';
import CreditsPanel from './panels/CreditsPanel';
import GraphPanel from './panels/GraphPanel';
import SandboxPanel from './panels/SandboxPanel';
import ShipPanel from './panels/ShipPanel';
import TracePanel from './panels/TracePanel';

function AuthCard({ onToken }: { onToken: (token: string, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Surface the API's own message (password rules, unknown user, …) instead
  // of the bare error envelope.
  function errText(err: unknown): string {
    const e = err as any;
    const detail =
      e?.message ?? e?.error?.message ?? e?.details?.[0]?.message ?? (typeof e === 'string' ? e : null);
    return detail ?? JSON.stringify(e);
  }

  async function go(mode: 'in' | 'up') {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'up') {
        const res = await butterbase.auth.signUp({ email, password });
        if (res.error) throw res.error;
      }
      const res = await butterbase.auth.signIn({ email, password });
      if (res.error || !res.data) throw res.error ?? new Error('no session');
      const token = (res.data as any).access_token ?? butterbase.getAccessToken();
      if (!token) throw new Error('sign-in returned no access token');
      onToken(token, email);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>RescueOps++</h1>
        <div className="muted">Sign in to mission control</div>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="muted" style={{ fontSize: 11 }}>
          password: 8+ chars with upper, lower, number &amp; special character
        </div>
        <div className="row">
          <button disabled={busy} onClick={() => go('in')}>
            Sign in
          </button>
          <button disabled={busy} onClick={() => go('up')}>
            Sign up
          </button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

// Demo mode: sign in automatically as the seeded on-call user so the
// dashboard opens straight onto mission control. Set VITE_AUTO_LOGIN=0 to
// bring the sign-in screen back.
const AUTO_LOGIN = (import.meta.env.VITE_AUTO_LOGIN ?? '1') !== '0';
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL ?? 'oncall@rescueops.dev';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'Resc!ue0ps2026';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [autoTried, setAutoTried] = useState(!AUTO_LOGIN);
  const [incident, setIncident] = useState<Incident | null>(null);
  // Bumped after any state-changing action so data panels refetch.
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!AUTO_LOGIN) return;
    butterbase.auth
      .signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .then((res: any) => {
        const t = res.data?.access_token ?? butterbase.getAccessToken();
        if (!res.error && t) {
          setToken(t);
          setEmail(`${DEMO_EMAIL} (demo)`);
        }
      })
      .catch(() => {})
      .finally(() => setAutoTried(true));
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const inc = await fetchIncident();
        if (alive) setIncident(inc);
      } catch {
        if (alive) setIncident(null);
      }
    };
    poll();
    const h = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, []);

  if (!token) {
    if (!autoTried) return <div className="auth-wrap muted">signing in…</div>;
    return <AuthCard onToken={(t, e) => (setToken(t), setEmail(e))} />;
  }

  return (
    <>
      <div className="topbar">
        <h1>RESCUEOPS++ MISSION CONTROL</h1>
        <span className={`status-pill ${incident?.status === 'incident' ? 'incident' : 'ok'}`}>
          {incident === null ? 'sensor offline' : incident.status === 'incident' ? 'INCIDENT' : 'all clear'}
        </span>
        {incident?.status === 'incident' && (
          <span className="muted">
            root cause <b>{incident.root_cause}</b> · blast {incident.blast_radius.join(', ')}
          </span>
        )}
        <div className="spacer" />
        <span className="who">{email}</span>
      </div>
      <div className="grid">
        <div className="panel graph">
          <h2>Code graph</h2>
          <GraphPanel incident={incident} />
        </div>
        <div className="panel">
          <h2>Agent trace</h2>
          <TracePanel token={token} incident={incident} />
        </div>
        <div className="panel">
          <h2>Sandbox verify</h2>
          <SandboxPanel token={token} incident={incident} onChanged={bump} />
        </div>
        <div className="panel">
          <h2>Approvals</h2>
          <ApprovalPanel token={token} tick={tick} onChanged={bump} />
        </div>
        <div className="panel">
          <h2>Ship</h2>
          <ShipPanel token={token} tick={tick} onChanged={bump} />
        </div>
      </div>
      <div className="grid" style={{ paddingTop: 0, gridTemplateColumns: '1fr' }}>
        <div className="panel" style={{ minHeight: 120 }}>
          <h2>Credits &amp; plan</h2>
          <CreditsPanel token={token} tick={tick} />
        </div>
      </div>
    </>
  );
}

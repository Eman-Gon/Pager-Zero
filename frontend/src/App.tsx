'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchIncident, setSessionRefresher, type Incident } from './api';
import {
  clearSession,
  DEMO_EMAIL,
  emailsMatch,
  friendlyAuthError,
  loadStoredSession,
  passwordRules,
  passwordValid,
  saveSession,
  signIn,
  signInDemo,
  signUp,
} from './auth';
import CreditsPanel from './panels/CreditsPanel';
import Neo4jNodesScreen from './panels/Neo4jNodesScreen';
import StatusBar from './panels/StatusBar';
import WizardShell from './wizard/WizardShell';

function AuthCard({ onToken }: { onToken: (token: string, email: string) => void }) {
  const [mode, setMode] = useState<'demo' | 'in' | 'up'>('demo');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = passwordRules(password);
  const pwOk = passwordValid(password);
  const emailsOk = mode !== 'up' || emailsMatch(email, confirmEmail);
  const passwordsOk = mode !== 'up' || (password === confirmPassword && password.length > 0);

  async function demo() {
    setBusy(true);
    setError(null);
    try {
      const token = await signInDemo();
      saveSession(token, `${DEMO_EMAIL} (demo)`);
      onToken(token, `${DEMO_EMAIL} (demo)`);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitSignIn() {
    setBusy(true);
    setError(null);
    try {
      const token = await signIn(email.trim(), password);
      saveSession(token, email.trim());
      onToken(token, email.trim());
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitSignUp() {
    if (!emailsOk) {
      setError('Email addresses do not match');
      return;
    }
    if (!passwordsOk) {
      setError('Passwords do not match');
      return;
    }
    if (!pwOk) {
      setError('Password does not meet all requirements');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await signUp(email.trim(), password);
      saveSession(token, email.trim());
      onToken(token, email.trim());
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card auth-card-wide">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">P0</span>
          <h1>PagerZero</h1>
        </div>
        <div className="muted">Mission control</div>

        <div className="auth-tabs">
          <button type="button" className={mode === 'demo' ? 'auth-tab active' : 'auth-tab'} onClick={() => setMode('demo')}>
            Demo
          </button>
          <button type="button" className={mode === 'in' ? 'auth-tab active' : 'auth-tab'} onClick={() => setMode('in')}>
            Sign in
          </button>
          <button type="button" className={mode === 'up' ? 'auth-tab active' : 'auth-tab'} onClick={() => setMode('up')}>
            Create account
          </button>
        </div>

        {mode === 'demo' && (
          <>
            <p className="muted auth-blurb">Unlimited demo access — no sign-up, no rate limits.</p>
            <button className="auth-demo-btn" disabled={busy} onClick={demo}>
              {busy ? 'Opening mission control…' : 'Continue as demo on-call'}
            </button>
            <div className="muted auth-hint">{DEMO_EMAIL}</div>
          </>
        )}

        {mode === 'in' && (
          <>
            <label className="auth-label">
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="auth-label">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="auth-primary-btn" disabled={busy || !email || !password} onClick={submitSignIn}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </>
        )}

        {mode === 'up' && (
          <>
            <label className="auth-label">
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="auth-label">
              Confirm email
              <input
                type="email"
                autoComplete="email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
              />
            </label>
            {confirmEmail && !emailsOk && <div className="err auth-field-err">Emails do not match</div>}

            <label className="auth-label">
              Password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="auth-label">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            {confirmPassword && !passwordsOk && <div className="err auth-field-err">Passwords do not match</div>}

            <ul className="password-rules">
              {rules.map((r) => (
                <li key={r.id} className={r.ok ? 'rule-ok' : 'rule-pending'}>
                  {r.ok ? '✓' : '○'} {r.label}
                </li>
              ))}
            </ul>

            <button
              className="auth-primary-btn"
              disabled={busy || !email || !confirmEmail || !password || !confirmPassword || !emailsOk || !passwordsOk || !pwOk}
              onClick={submitSignUp}
            >
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </>
        )}

        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}

const AUTO_LOGIN = (process.env.NEXT_PUBLIC_AUTO_LOGIN ?? '1') !== '0';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [autoTried, setAutoTried] = useState(false);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [screen, setScreen] = useState<'mission' | 'nodes'>('mission');
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Session renewal for tabs left open past token expiry: demo sessions
  // silently re-sign-in; real users are sent back to the auth card.
  useEffect(() => {
    setSessionRefresher(async () => {
      const isDemo = AUTO_LOGIN || email.includes(DEMO_EMAIL);
      if (isDemo) {
        try {
          const t = await signInDemo();
          saveSession(t, `${DEMO_EMAIL} (demo)`);
          setToken(t);
          setEmail(`${DEMO_EMAIL} (demo)`);
          return t;
        } catch {
          /* fall through to sign-out */
        }
      }
      clearSession();
      setToken(null);
      return null;
    });
    return () => setSessionRefresher(null);
  }, [email]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = loadStoredSession();
      if (stored) {
        setToken(stored.token);
        setEmail(stored.email);
        setAutoTried(true);
        return;
      }
      if (!AUTO_LOGIN) {
        setAutoTried(true);
        return;
      }
      try {
        const t = await signInDemo();
        if (!alive) return;
        saveSession(t, `${DEMO_EMAIL} (demo)`);
        setToken(t);
        setEmail(`${DEMO_EMAIL} (demo)`);
      } catch {
        /* show AuthCard */
      } finally {
        if (alive) setAutoTried(true);
      }
    })();
    return () => {
      alive = false;
    };
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
    if (!autoTried) {
      return (
        <div className="auth-wrap">
          <div className="auth-card auth-loading">
            <span className="spinner" />
            <span className="muted">Opening mission control…</span>
          </div>
        </div>
      );
    }
    return <AuthCard onToken={(t, e) => (saveSession(t, e), setToken(t), setEmail(e))} />;
  }

  return (
    <>
      <div className="topbar">
        <h1><span className="brand-mark" aria-hidden="true">P0</span>PAGERZERO MISSION CONTROL</h1>
        <nav className="topbar-nav" aria-label="Mission Control screens">
          <button type="button" className={screen === 'mission' ? 'active' : ''} onClick={() => setScreen('mission')}>
            Mission
          </button>
          <button type="button" className={screen === 'nodes' ? 'active' : ''} onClick={() => setScreen('nodes')}>
            Neo4j nodes
          </button>
        </nav>
        <span className={`status-pill ${incident?.status === 'incident' ? 'incident' : 'ok'}`}>
          {incident === null ? 'sensor offline' : incident.status === 'incident' ? 'INCIDENT' : 'all clear'}
        </span>
        {incident?.status === 'incident' && (
          <span className="topbar-incident">
            root cause <b>{incident.root_cause}</b> · blast {incident.blast_radius.join(', ')}
          </span>
        )}
        <div className="spacer" />
        <div className="topbar-credits">
          <CreditsPanel token={token} tick={tick} />
        </div>
        <StatusBar />
        <span className="who">{email}</span>
      </div>
      {screen === 'mission' ? (
        <WizardShell token={token} incident={incident} tick={tick} bump={bump} />
      ) : (
        <Neo4jNodesScreen />
      )}
    </>
  );
}

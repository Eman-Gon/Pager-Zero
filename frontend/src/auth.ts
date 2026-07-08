import { butterbase } from './api';

const TOKEN_KEY = 'rescueops_access_token';
const EMAIL_KEY = 'rescueops_email';

export const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? 'oncall@rescueops.dev';
export const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? 'Resc!ue0ps2026';

export function saveSession(token: string, email: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* private browsing */
  }
  butterbase.setAccessToken(token);
}

// Butterbase access tokens are short-lived. A stored token past its `exp` makes
// every Data API call fail with AUTH_END_USER_JWT_EXPIRED (401) — persist,
// account sync, approvals all break — with no recovery until storage is cleared.
// Decode the JWT `exp` (base64url payload) so an expired token is treated as
// absent; the app then re-signs-in for a fresh one instead of looping on 401s.
export function tokenExpired(token: string, skewSeconds = 30): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64)) as { exp?: number };
    return typeof exp === 'number' && exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return false; // unparseable — let the server be the judge
  }
}

export function loadStoredSession(): { token: string; email: string } | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const email = localStorage.getItem(EMAIL_KEY);
    if (!token) return null;
    if (tokenExpired(token)) {
      clearSession();
      return null;
    }
    butterbase.setAccessToken(token);
    return { token, email: email ?? DEMO_EMAIL };
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* ignore */
  }
}

function errMessage(err: unknown): string {
  const e = err as { message?: string; error?: { message?: string } };
  return e?.message ?? e?.error?.message ?? String(err);
}

/** Butterbase rate limits are server-side — point users at the demo account instead of showing timers. */
export function friendlyAuthError(err: unknown): string {
  const raw = errMessage(err);
  if (/rate limit/i.test(raw)) {
    return 'Auth is temporarily busy on Butterbase. Use “Continue as demo on-call” for unlimited demo access.';
  }
  return raw;
}

export interface PasswordRule {
  id: string;
  label: string;
  ok: boolean;
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: 'len', label: '8+ characters', ok: password.length >= 8 },
    { id: 'upper', label: 'one uppercase letter', ok: /[A-Z]/.test(password) },
    { id: 'lower', label: 'one lowercase letter', ok: /[a-z]/.test(password) },
    { id: 'digit', label: 'one number', ok: /\d/.test(password) },
    { id: 'special', label: 'one special character', ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function passwordValid(password: string): boolean {
  return passwordRules(password).every((r) => r.ok);
}

export function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function tokenFromSignIn(email: string, password: string): Promise<string> {
  const res = await butterbase.auth.signIn({ email, password });
  if (res.error) throw new Error(errMessage(res.error));
  const token = (res.data as { access_token?: string } | null)?.access_token ?? butterbase.getAccessToken();
  if (!token) throw new Error('sign-in returned no access token');
  return token;
}

export async function signIn(email: string, password: string): Promise<string> {
  return tokenFromSignIn(email, password);
}

export async function signUp(email: string, password: string): Promise<string> {
  const res = await butterbase.auth.signUp({ email, password });
  if (res.error) throw new Error(errMessage(res.error));
  return tokenFromSignIn(email, password);
}

export async function signInDemo(): Promise<string> {
  return signIn(DEMO_EMAIL, DEMO_PASSWORD);
}

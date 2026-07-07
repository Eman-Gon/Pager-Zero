// Temporary end-to-end check: sign in as the demo on-call user, then drive a
// real /diagnose through the local RocketRide engine. Prints the result.
import { createClient } from '@butterbase/sdk';

const APP_ID = process.env.BUTTERBASE_APP_ID;
const API_URL = process.env.BUTTERBASE_API_URL ?? 'https://api.butterbase.ai';
const EMAIL = process.env.DEMO_EMAIL ?? 'oncall@rescueops.dev';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Resc!ue0ps2026';
const RESPONDER = process.env.RESPONDER_URL ?? 'http://localhost:3004';

const client = createClient({ appId: APP_ID, apiUrl: API_URL, persistSession: false });

async function getToken() {
  // The demo user already exists — just sign in (retry through the auth rate limit).
  for (let attempt = 1; ; attempt++) {
    const res = await client.auth.signIn({ email: EMAIL, password: PASSWORD });
    if (!res.error && res.data) return res.data.access_token ?? client.getAccessToken();
    const msg = res.error?.message ?? String(res.error);
    if (attempt >= 6) throw new Error(`sign-in failed after ${attempt} tries: ${msg}`);
    console.log(`signIn attempt ${attempt} failed (${msg}) — waiting 45s`);
    await new Promise((r) => setTimeout(r, 45_000));
  }
}

const token = await getToken();
console.log('got JWT:', token ? token.slice(0, 24) + '…' : '(none)');

const t0 = Date.now();
const r = await fetch(`${RESPONDER}/diagnose`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
});
const data = await r.json();
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\n/diagnose -> HTTP ${r.status} in ${secs}s`);
console.log('status      :', data.status);
if (data.diagnosis) {
  const d = data.diagnosis;
  console.log('severity    :', d.severity);
  console.log('root cause  :', (d.root_cause_explanation ?? '').slice(0, 160));
  console.log('fix approach:', (d.proposed_fix_approach ?? '').slice(0, 160));
  console.log('cited runbook:', d.cited_runbook);
  console.log('candidate fix path:', d.candidate_fix?.path);
  console.log('incident_id :', data.incident_id, '| action_id:', data.action_id);
} else {
  console.log('raw:', JSON.stringify(data).slice(0, 400));
}

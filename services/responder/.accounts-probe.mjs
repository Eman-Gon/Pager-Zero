// Probe: can the Data API UPDATE the accounts row? Prints FIXED or STILL-BROKEN.
// Run: cd services/responder && set -a && source ../../.env && set +a && node .accounts-probe.mjs
import { createClient } from '@butterbase/sdk';

const APP_ID = process.env.BUTTERBASE_APP_ID;
const API_URL = (process.env.BUTTERBASE_API_URL ?? 'https://api.butterbase.ai').replace(/\/+$/, '');
const EMAIL = process.env.DEMO_EMAIL ?? 'oncall@rescueops.dev';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Resc!ue0ps2026';

const client = createClient({ appId: APP_ID, apiUrl: API_URL, persistSession: false });
const signin = await client.auth.signIn({ email: EMAIL, password: PASSWORD });
if (signin.error) {
  console.error('sign-in failed:', JSON.stringify(signin.error));
  process.exit(1);
}
const token = signin.data?.access_token ?? client.getAccessToken();
client.setAccessToken(token);
const userId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub;

const before = await client.from('accounts').select('*').eq('user_id', userId).maybeSingle();
if (before.error || !before.data) {
  console.error('accounts select failed:', JSON.stringify(before.error ?? 'no row'));
  process.exit(1);
}
const row = Array.isArray(before.data) ? before.data[0] : before.data;
console.log('before:', JSON.stringify(row));

const target = row.apply_credits === 5 ? 4 : 5;
// Update by `id` — the Data API only routes single-row PATCH as /accounts/:id.
const upd = await client.from('accounts').update({ apply_credits: target }).eq('id', row.id);
if (upd.error) {
  console.error('UPDATE error:', JSON.stringify(upd.error));
  console.log('STILL-BROKEN');
  process.exit(2);
}

const after = await client.from('accounts').select('apply_credits').eq('user_id', userId).maybeSingle();
const got = (Array.isArray(after.data) ? after.data[0] : after.data)?.apply_credits;
console.log('after :', got, '(wanted', target + ')');
if (got === target) {
  // restore original value so the probe is side-effect-free
  await client.from('accounts').update({ apply_credits: row.apply_credits }).eq('id', row.id);
  console.log('FIXED');
  process.exit(0);
} else {
  console.log('STILL-BROKEN');
  process.exit(2);
}

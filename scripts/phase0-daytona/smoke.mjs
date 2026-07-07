// M4 Phase 0 connectivity smoke: prove a real Daytona sandbox runs a command
// and is deleted afterwards. FLAGGED (skipped) when DAYTONA_API_KEY is unset.
//
//   cd scripts/phase0-daytona && npm install && npm run smoke

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
try {
  for (const line of readFileSync(path.join(repoRoot, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env yet */
}

if (!process.env.DAYTONA_API_KEY) {
  console.log('FLAGGED (skipped)  daytona  DAYTONA_API_KEY not set — cannot create a sandbox');
  process.exit(0);
}

const { Daytona } = await import('@daytona/sdk');
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  ...(process.env.DAYTONA_API_URL ? { apiUrl: process.env.DAYTONA_API_URL } : {}),
});

let sandbox;
try {
  sandbox = await daytona.create({ language: 'typescript' });
  console.log(`sandbox created: ${sandbox.id}`);
  const res = await sandbox.process.executeCommand('node -v');
  const out = String(res.result ?? '').trim();
  console.log(`node -v -> "${out}" (exitCode=${res.exitCode})`);
  if (!/^v\d+\./.test(out)) {
    console.log('FAIL  daytona  node -v did not return a version string');
    process.exit(1);
  }
  console.log('PASS  daytona  real sandbox executed the command');
} finally {
  if (sandbox) {
    await sandbox.delete();
    console.log(`sandbox ${sandbox.id} deleted`);
  }
}

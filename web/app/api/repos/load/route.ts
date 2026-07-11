import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const run = promisify(execFile);
const SENSOR_URL = process.env.NEXT_PUBLIC_SENSOR_URL ?? 'http://127.0.0.1:3003';
// Patient repo dirs are lowercase kebab; keep the shell arg tightly constrained.
const VALID_REPO = /^[a-z0-9][a-z0-9-]*$/i;

export async function POST(request: Request) {
  let repo: string;
  try {
    const body = (await request.json()) as { repo?: string };
    repo = (body.repo ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!repo || repo === 'target-repo' || !VALID_REPO.test(repo)) {
    return NextResponse.json({ error: 'Provide a valid patient repo name.' }, { status: 400 });
  }

  const root = resolve(process.cwd(), '..');
  const script = join(root, 'scripts', 'load-patient.sh');

  try {
    const { stdout } = await run('bash', [script, repo], {
      cwd: root,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });

    // Ask the sensor to rebuild its code graph for the freshly loaded source so
    // the switch takes effect without a manual restart. If the sensor is down,
    // the load still succeeded — surface a restart hint instead of failing.
    let sensorReloaded = false;
    let note = 'Repo loaded. Restart the sensor to pick up the new code graph.';
    try {
      const res = await fetch(`${SENSOR_URL}/graph/reload`, { method: 'POST' });
      sensorReloaded = res.ok;
      if (res.ok) note = 'Repo loaded and the sensor rebuilt its code graph.';
    } catch {
      /* sensor may be offline in some dev setups */
    }

    return NextResponse.json({ status: 'loaded', repo, sensorReloaded, note, output: stdout });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to load '${repo}': ${message}` }, { status: 500 });
  }
}

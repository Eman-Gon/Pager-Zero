import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const run = promisify(execFile);

// The sensor scans exactly one repo; the same dir the load/break scripts touch.
const TARGET_DIR = resolve(process.cwd(), '..', 'target-repo');
// Only allow repo-relative source/test paths — no traversal, no absolute paths.
const SAFE_PATH = /^(src|test)\/[A-Za-z0-9_./-]+$/;

async function gitShow(ref: string, file: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', TARGET_DIR, 'show', `${ref}:${file}`], {
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null; // ref or file may not exist (e.g. a newly added file)
  }
}

export async function GET(request: Request) {
  const file = (new URL(request.url).searchParams.get('file') ?? '').trim();
  if (!file || file.includes('..') || !SAFE_PATH.test(file)) {
    return NextResponse.json({ error: 'Provide a valid src/ or test/ file path.' }, { status: 400 });
  }

  // Broken = what the sensor currently sees on disk. Fixed = the clean baseline
  // captured at the `good` tag by scripts/load-patient.sh.
  const [brokenDisk, fixed] = await Promise.all([
    readFile(join(TARGET_DIR, file), 'utf8').catch(() => null),
    gitShow('good', file),
  ]);
  // Fall back to the committed HEAD version if the working tree file is gone.
  const broken = brokenDisk ?? (await gitShow('HEAD', file));

  if (broken == null && fixed == null) {
    return NextResponse.json({ error: `File "${file}" not found in target-repo.` }, { status: 404 });
  }

  return NextResponse.json({
    file,
    broken,
    fixed,
    identical: broken != null && fixed != null && broken === fixed,
  });
}

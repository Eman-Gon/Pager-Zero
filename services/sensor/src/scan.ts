import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Driver } from 'neo4j-driver';
import { openSession } from './neo4j-config.js';
import { log } from './log.js';

// execFile with argument arrays only — no shell involved anywhere in this module.
const run = promisify(execFile);
const RESULT_FILE = '/tmp/vitest-result.json';

// The host's node_modules is hidden by an anonymous volume (host binaries are
// darwin; the container is linux), so install the target's deps into the volume once.
export async function ensureTargetDeps(targetDir: string): Promise<void> {
  if (existsSync(path.join(targetDir, 'node_modules', '.bin', 'vitest'))) return;
  log('installing_target_deps');
  await run('npm', ['install', '--no-save', '--no-audit', '--no-fund'], {
    cwd: targetDir,
    timeout: 300_000,
  });
  log('target_deps_installed');
}

export async function gitHead(targetDir: string): Promise<string> {
  const { stdout } = await run('git', ['-C', targetDir, 'rev-parse', 'HEAD']);
  return stdout.trim();
}

async function changedFiles(targetDir: string): Promise<string[]> {
  const { stdout } = await run('git', ['-C', targetDir, 'diff', '--name-only', 'good..HEAD']);
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

async function runTests(
  targetDir: string,
): Promise<{ file: string; status: 'passing' | 'failing' }[]> {
  await rm(RESULT_FILE, { force: true });
  let vitestError: unknown = null;
  try {
    await run('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${RESULT_FILE}`], {
      cwd: targetDir,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    vitestError = err; // vitest exits non-zero when tests fail; the JSON file is still written
  }
  let parsed: { testResults?: { name: string; status: string }[] };
  try {
    parsed = JSON.parse(await readFile(RESULT_FILE, 'utf8'));
  } catch {
    throw vitestError ?? new Error('vitest produced no JSON output');
  }
  const results = (parsed.testResults ?? []).map((r) => ({
    file: path.relative(targetDir, r.name),
    status: r.status === 'passed' ? ('passing' as const) : ('failing' as const),
  }));
  if (results.length === 0) throw new Error('vitest JSON contained no testResults');
  return results;
}

export async function scan(driver: Driver, targetDir: string): Promise<void> {
  const tests = await runTests(targetDir);
  const changed = await changedFiles(targetDir);
  const session = openSession(driver);
  try {
    await session.executeWrite(async (tx) => {
      const testResult = await tx.run(
        `UNWIND $tests AS t
         MATCH (test:Test {file: t.file})
         WITH test, test.status AS old, t.status AS new
         SET test.status = new
         RETURN test.file AS file, old, new`,
        { tests },
      );
      for (const r of testResult.records) {
        if (r.get('old') !== r.get('new')) {
          log('status_change', { test: r.get('file'), to: r.get('new') });
        }
      }

      const fnResult = await tx.run(
        `MATCH (f:Function)
         MATCH (t:Test)-[:TESTS]->(f)
         WITH f, f.status AS old, collect(t.status) AS statuses
         WITH f, old,
              CASE WHEN any(s IN statuses WHERE s = 'failing') THEN 'failing' ELSE 'passing' END AS new
         SET f.status = new
         RETURN f.name AS fn, old, new`,
      );
      for (const r of fnResult.records) {
        if (r.get('old') !== r.get('new')) {
          log('status_change', { function: r.get('fn'), to: r.get('new') });
        }
      }

      const changedResult = await tx.run(
        `MATCH (f:Function)
         WITH f, f.changed AS old, f.file IN $changed AS new
         SET f.changed = new
         RETURN f.name AS fn, old, new`,
        { changed },
      );
      for (const r of changedResult.records) {
        if (r.get('old') !== r.get('new')) {
          log('changed_flag', { function: r.get('fn'), to: r.get('new') });
        }
      }
    });
  } finally {
    await session.close();
  }
}

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Daytona, Image, type Sandbox } from '@daytona/sdk';
import { log } from './log.js';
import type { CandidateFix } from './pipeline.js';

const execFileAsync = promisify(execFile);

export interface VerifyResult {
  verified: boolean;
  test_output: string;
}

function assertSafeRepoPath(p: string): void {
  if (path.isAbsolute(p) || p.split(/[\\/]/).includes('..')) {
    throw new Error(`candidate_fix.path escapes the repo: ${p}`);
  }
}

// A candidate whose path doesn't exist in the patient would land as an orphan
// file the tests never import — the untouched suite passes and rubber-stamps
// the "fix". Reject it as unverified instead of letting it trivially pass.
async function rejectOrphanPath(targetDir: string, p: string): Promise<VerifyResult | null> {
  try {
    await access(path.join(targetDir, p));
    return null;
  } catch {
    log('verify_rejected_orphan_path', { path: p });
    return {
      verified: false,
      test_output: `candidate_fix.path "${p}" does not exist in the target repo — a fix must modify a file the test suite actually covers`,
    };
  }
}

let daytona: Daytona | null = null;
function client(): Daytona {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error('DAYTONA_API_KEY not set — cannot verify in a sandbox');
  }
  daytona ??= new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    ...(process.env.DAYTONA_API_URL ? { apiUrl: process.env.DAYTONA_API_URL } : {}),
  });
  return daytona;
}

// Tar the target repo (excluding node_modules — the sandbox installs its own
// linux deps) so it can be uploaded to the sandbox in one shot.
async function packRepo(targetDir: string): Promise<string> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'verify-'));
  const tarball = path.join(tmpDir, 'repo.tgz');
  // COPYFILE_DISABLE: macOS bsdtar otherwise embeds AppleDouble (._*) metadata
  // files, which extract as real files on Linux and match vitest's test glob —
  // phantom failing "tests" that reject every candidate.
  await execFileAsync(
    'tar',
    [
      '-czf',
      tarball,
      '-C',
      targetDir,
      '--exclude',
      'node_modules',
      '--exclude',
      '.git',
      '--exclude',
      '._*',
      '.',
    ],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } },
  );
  return tarball;
}

async function setupRepo(sandbox: Sandbox, tarball: string): Promise<void> {
  await sandbox.fs.uploadFile(tarball, 'repo.tgz');
  const extract = await sandbox.process.executeCommand('mkdir -p repo && tar -xzf repo.tgz -C repo');
  if (extract.exitCode !== 0) throw new Error(`tar extract failed: ${extract.result}`);
  const install = await sandbox.process.executeCommand('npm install', 'repo', undefined, 300);
  if (install.exitCode !== 0) throw new Error(`npm install failed: ${String(install.result).slice(-2000)}`);
}

async function applyAndTest(sandbox: Sandbox, candidate: CandidateFix): Promise<VerifyResult> {
  await sandbox.fs.uploadFile(Buffer.from(candidate.content, 'utf8'), path.posix.join('repo', candidate.path));
  const test = await sandbox.process.executeCommand('npm test', 'repo', undefined, 120);
  return { verified: test.exitCode === 0, test_output: String(test.result ?? '') };
}

// Phase 1: single-candidate verify-loop — sandbox → upload repo → install →
// apply the candidate (full-file replace) → real `npm test` decides.
export async function verifyCandidate(targetDir: string, candidate: CandidateFix): Promise<VerifyResult> {
  assertSafeRepoPath(candidate.path);
  const orphan = await rejectOrphanPath(targetDir, candidate.path);
  if (orphan) return orphan;
  const tarball = await packRepo(targetDir);
  let sandbox: Sandbox | undefined;
  try {
    sandbox = await client().create({ language: 'typescript' });
    log('sandbox_created', { id: sandbox.id });
    await setupRepo(sandbox, tarball);
    const result = await applyAndTest(sandbox, candidate);
    log('sandbox_verified', { id: sandbox.id, verified: result.verified });
    return result;
  } finally {
    await rm(path.dirname(tarball), { recursive: true, force: true });
    if (sandbox) {
      await sandbox.delete().catch((err: unknown) => log('sandbox_delete_failed', { error: String(err) }));
      log('sandbox_deleted', { id: sandbox.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 2: snapshot + parallel candidates
// ---------------------------------------------------------------------------

// Where the repo (with node_modules pre-installed) lives inside the snapshot.
const SNAPSHOT_REPO_DIR = '/repo';

// Snapshot name is keyed to the lockfile so a dependency change rebuilds it.
async function snapshotName(targetDir: string): Promise<string> {
  const lock = await readFile(path.join(targetDir, 'package-lock.json'));
  return `rescueops-target-${createHash('sha256').update(lock).digest('hex').slice(0, 12)}`;
}

// Build (once) a Daytona snapshot of target-repo with `npm install` already
// run, so Phase 2 sandboxes start test-ready and skip the install.
export async function ensureSnapshot(targetDir: string): Promise<string> {
  const name = await snapshotName(targetDir);
  try {
    const existing = await client().snapshot.get(name);
    if (String(existing.state) === 'active') {
      log('snapshot_reused', { name });
      return name;
    }
    await client().snapshot.activate(existing);
    log('snapshot_activated', { name });
    return name;
  } catch {
    /* not found — build it */
  }

  // Stage the repo without node_modules/.git as the image build context.
  const stage = await mkdtemp(path.join(os.tmpdir(), 'snap-'));
  try {
    await execFileAsync(
      'sh',
      [
        '-c',
        `tar -C ${JSON.stringify(targetDir)} --exclude node_modules --exclude .git --exclude '._*' -cf - . | tar -xf - -C ${JSON.stringify(stage)}`,
      ],
      // See packRepo: keep macOS AppleDouble files out of the snapshot too.
      { env: { ...process.env, COPYFILE_DISABLE: '1' } },
    );
    const image = Image.base('node:20-slim')
      .addLocalDir(stage, SNAPSHOT_REPO_DIR)
      // chmod: the image builds as root; sandboxes run as an unprivileged user
      // that must overwrite the candidate file and write vitest cache.
      .runCommands(`cd ${SNAPSHOT_REPO_DIR} && npm install && chmod -R 777 ${SNAPSHOT_REPO_DIR}`);
    log('snapshot_build_start', { name });
    await client().snapshot.create({ name, image }, { onLogs: (chunk) => log('snapshot_build_log', { chunk: chunk.trim() }) });
    log('snapshot_build_done', { name });
    return name;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export interface ParallelVerifyResult {
  selected: number | null; // index of the chosen (first verified) candidate
  results: (VerifyResult & { candidate_index: number })[];
}

// Verify N candidates in N snapshot-backed sandboxes concurrently and select
// the first verified:true (by candidate order). If the API key can't create
// snapshots (Daytona keys are scoped), falls back to fresh sandboxes with a
// per-sandbox install — still parallel, just without the snapshot head start.
export async function verifyCandidatesParallel(
  targetDir: string,
  candidates: CandidateFix[],
): Promise<ParallelVerifyResult> {
  for (const c of candidates) assertSafeRepoPath(c.path);

  let snapshot: string | null = null;
  try {
    snapshot = await ensureSnapshot(targetDir);
  } catch (err) {
    log('snapshot_flagged', { reason: String(err) });
  }
  const tarball = snapshot ? null : await packRepo(targetDir);
  const repoDir = snapshot ? SNAPSHOT_REPO_DIR : 'repo';

  // Index-keyed so a candidate's sandbox stays at sandboxes[i] regardless of
  // create() completion order, and so the finally can delete whatever got
  // created even if one create() rejects mid-flight (no orphaned sandboxes).
  const sandboxes: (Sandbox | undefined)[] = new Array(candidates.length);
  try {
    // Create all sandboxes first so the concurrency is observable via list().
    await Promise.all(
      candidates.map(async (_, i) => {
        const sandbox = await client().create(
          snapshot
            ? { snapshot, labels: { rescueops: 'verify', candidate: String(i) } }
            : { language: 'typescript', labels: { rescueops: 'verify', candidate: String(i) } },
        );
        sandboxes[i] = sandbox;
        log('sandbox_created', { id: sandbox.id, candidate: i, snapshot });
      }),
    );
    const created = sandboxes as Sandbox[];

    const ours = new Set(created.map((s) => s.id));
    const running: string[] = [];
    for await (const s of client().list()) if (ours.has(s.id)) running.push(`${s.id}:${s.state}`);
    log('sandboxes_concurrent', { count: running.length, sandboxes: running });

    const results = await Promise.all(
      created.map(async (sandbox, i) => {
        const candidate = candidates[i];
        const orphan = await rejectOrphanPath(targetDir, candidate.path);
        if (orphan) return { candidate_index: i, ...orphan };
        if (tarball) await setupRepo(sandbox, tarball);
        await sandbox.fs.uploadFile(
          Buffer.from(candidate.content, 'utf8'),
          path.posix.join(repoDir, candidate.path),
        );
        const test = await sandbox.process.executeCommand('npm test', repoDir, undefined, 120);
        const verified = test.exitCode === 0;
        log('sandbox_verified', { id: sandbox.id, candidate: i, verified });
        return { candidate_index: i, verified, test_output: String(test.result ?? '') };
      }),
    );
    const selected = results.find((r) => r.verified)?.candidate_index ?? null;
    return { selected, results };
  } finally {
    if (tarball) await rm(path.dirname(tarball), { recursive: true, force: true });
    await Promise.all(
      sandboxes.map((sandbox) =>
        sandbox
          ? sandbox
              .delete()
              .then(() => log('sandbox_deleted', { id: sandbox.id }))
              .catch((err: unknown) => log('sandbox_delete_failed', { id: sandbox.id, error: String(err) }))
          : Promise.resolve(),
      ),
    );
  }
}

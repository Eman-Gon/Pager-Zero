import { Octokit } from '@octokit/rest';
import { log } from './log.js';
import type { CandidateFix } from './pipeline.js';

const GITHUB_REPO = process.env.GITHUB_REPO ?? '';

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && GITHUB_REPO);
}

// The fix reaches the repo only as a commit on a new branch via the GitHub
// API — the local target-repo is never edited in place (M6 surgical rule).
export async function openFixPr(
  candidate: CandidateFix,
  incident: { root_cause: string | null; failing_tests: string[] },
): Promise<{ pr_url: string; branch: string }> {
  if (!githubConfigured()) {
    throw new Error('GITHUB_TOKEN / GITHUB_REPO not set — cannot open a PR');
  }
  const [owner, repo] = GITHUB_REPO.split('/');
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const { data: repoInfo } = await octokit.repos.get({ owner, repo });
  const base = repoInfo.default_branch;
  const { data: baseRef } = await octokit.git.getRef({ owner, repo, ref: `heads/${base}` });

  const branch = `rescueops/fix-${(incident.root_cause ?? 'incident').toLowerCase()}-${Date.now()}`;
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseRef.object.sha });

  // Full-file replace, mirroring how the fix was verified in the sandbox.
  let existingSha: string | undefined;
  try {
    const { data: existing } = await octokit.repos.getContent({ owner, repo, path: candidate.path, ref: branch });
    if (!Array.isArray(existing) && existing.type === 'file') existingSha = existing.sha;
  } catch {
    /* new file */
  }
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: candidate.path,
    message: `fix: restore ${incident.root_cause ?? 'broken function'} (RescueOps verified fix)`,
    content: Buffer.from(candidate.content, 'utf8').toString('base64'),
    branch,
    ...(existingSha ? { sha: existingSha } : {}),
  });

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    base,
    head: branch,
    title: `RescueOps: fix ${incident.root_cause ?? 'incident'}`,
    body: [
      'Automated fix shipped by RescueOps++.',
      '',
      `- Root cause: \`${incident.root_cause}\``,
      `- Failing tests before fix: ${incident.failing_tests.map((t) => `\`${t}\``).join(', ')}`,
      '- Candidate was verified green against the full test suite in a Daytona sandbox before this PR was opened.',
    ].join('\n'),
  });

  log('pr_opened', { pr_url: pr.html_url, branch });
  return { pr_url: pr.html_url, branch };
}

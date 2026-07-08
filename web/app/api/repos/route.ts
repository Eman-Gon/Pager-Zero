import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RepoOption {
  id: string;
  label: string;
  path: string;
  active: boolean;
}

async function packageName(dir: string): Promise<string | null> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name ?? null;
  } catch {
    return null;
  }
}

async function hasPackage(dir: string): Promise<boolean> {
  try {
    return (await stat(join(dir, 'package.json'))).isFile();
  } catch {
    return false;
  }
}

export async function GET() {
  const root = resolve(process.cwd(), '..');
  // The sensor scans exactly one repo: target-repo. Patient repos are templates
  // that must be loaded into target-repo before the sensor starts.
  const active = 'target-repo';
  const repos: RepoOption[] = [];

  const targetDir = join(root, 'target-repo');
  if (await hasPackage(targetDir)) {
    repos.push({
      id: 'target-repo',
      label: (await packageName(targetDir)) ?? 'target-repo',
      path: 'target-repo',
      active: active.endsWith('target-repo') || active === targetDir,
    });
  }

  try {
    const patientsDir = join(root, 'patients');
    const entries = await readdir(patientsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(patientsDir, entry.name);
      if (!(await hasPackage(dir))) continue;
      const path = `patients/${entry.name}`;
      repos.push({
        id: entry.name,
        label: (await packageName(dir)) ?? entry.name,
        path,
        active: active === path || active.endsWith(`/${path}`),
      });
    }
  } catch {
    /* Patient examples are optional. */
  }

  return NextResponse.json({
    active,
    repos,
  });
}

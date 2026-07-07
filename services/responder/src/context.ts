import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Driver } from 'neo4j-driver';
import type { RunbookHit } from './runbooks.js';

export interface Incident {
  status: 'ok' | 'incident';
  failing_tests: string[];
  changed_functions: string[];
  root_cause: string | null;
  blast_radius: string[];
}

// Each snippet capped so a pathological file can't blow up the prompt.
const MAX_SNIPPET = 8_000;

async function readSnippet(targetDir: string, relFile: string): Promise<string> {
  const resolved = path.resolve(targetDir, relFile);
  if (!resolved.startsWith(path.resolve(targetDir) + path.sep)) {
    throw new Error(`refusing to read outside target dir: ${relFile}`);
  }
  return (await readFile(resolved, 'utf8')).slice(0, MAX_SNIPPET);
}

export async function functionFile(driver: Driver, fnName: string): Promise<string | null> {
  const session = driver.session();
  try {
    const res = await session.run(`MATCH (f:Function {name: $name}) RETURN f.file AS file`, {
      name: fnName,
    });
    return res.records[0]?.get('file') ?? null;
  } finally {
    await session.close();
  }
}

export async function assembleContext(
  driver: Driver,
  targetDir: string,
  incident: Incident,
  runbooks: RunbookHit[] | null = null,
): Promise<string> {
  const parts: string[] = [
    '## Incident',
    JSON.stringify(
      {
        root_cause: incident.root_cause,
        changed_functions: incident.changed_functions,
        failing_tests: incident.failing_tests,
        blast_radius: incident.blast_radius,
      },
      null,
      2,
    ),
  ];

  if (incident.root_cause) {
    const file = await functionFile(driver, incident.root_cause);
    if (file) {
      parts.push(
        `## Root-cause function source (${file}, contains \`${incident.root_cause}\`)`,
        '```typescript',
        await readSnippet(targetDir, file),
        '```',
      );
    }
  }

  for (const testFile of incident.failing_tests) {
    parts.push(`## Failing test (${testFile})`, '```typescript', await readSnippet(targetDir, testFile), '```');
  }

  if (runbooks?.length) {
    parts.push(
      '## Retrieved runbooks (cite the one you rely on by its exact title in cited_runbook)',
      ...runbooks.map(
        (rb) =>
          `### ${rb.title}${rb.applies ? ` (linked to \`${incident.root_cause}\` in the code graph)` : ''}\n${rb.text}`,
      ),
    );
  }

  return parts.join('\n');
}

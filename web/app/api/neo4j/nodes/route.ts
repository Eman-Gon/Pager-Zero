import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import neo4j from 'neo4j-driver';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

let rootEnv: Record<string, string> | null = null;

function loadRootEnv(): Record<string, string> {
  if (rootEnv) return rootEnv;
  rootEnv = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), '..', '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const clean = trimmed.replace(/^export\s+/, '');
      const eq = clean.indexOf('=');
      if (eq === -1) continue;
      const key = clean.slice(0, eq).trim();
      let value = clean.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      rootEnv[key] = value;
    }
  } catch {
    /* Runtime env can still provide the Neo4j values. */
  }
  return rootEnv;
}

function env(name: string): string | undefined {
  return process.env[name] ?? loadRootEnv()[name];
}

function numberValue(value: unknown): number {
  if (neo4j.isInt(value)) return value.toNumber();
  return Number(value ?? 0);
}

function cleanValue(value: unknown): JsonValue {
  if (neo4j.isInt(value)) return value.inSafeRange() ? value.toNumber() : value.toString();
  if (Array.isArray(value)) return value.map(cleanValue);
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, cleanValue(nested)]),
    );
  }
  return String(value);
}

function cleanProperties(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, cleanValue(nested)]),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const label = url.searchParams.get('label') ?? '';
  const limit = Math.min(300, Math.max(25, Number(url.searchParams.get('limit') ?? 200)));
  const uri = env('NEO4J_URI') ?? env('NEO4J_URL');
  const user = env('NEO4J_USERNAME') ?? env('NEO4J_USER') ?? 'neo4j';
  const password = env('NEO4J_PASSWORD');
  const database = env('NEO4J_DATABASE');

  if (!uri || !password) {
    return NextResponse.json({ error: 'Neo4j is not configured for the web app.' }, { status: 500 });
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  try {
    const session = driver.session(database ? { database } : undefined);
    try {
      const totalResult = await session.run(`MATCH (n) RETURN count(n) AS total`);
      const labelResult = await session.run(`
          MATCH (n)
          UNWIND labels(n) AS label
          RETURN label, count(*) AS count
          ORDER BY count DESC, label ASC
        `);
      const nodeResult = await session.run(
        `
          MATCH (n)
          WHERE $label = '' OR $label IN labels(n)
          WITH n
          OPTIONAL MATCH (n)-[out]->()
          WITH n, count(out) AS outgoing
          OPTIONAL MATCH ()-[in]->(n)
          WITH n, outgoing, count(in) AS incoming, labels(n) AS nodeLabels, properties(n) AS props
          RETURN
            elementId(n) AS elementId,
            toString(coalesce(n.name, n.file, n.title, n.id, elementId(n))) AS display,
            nodeLabels AS labels,
            props,
            outgoing,
            incoming
          ORDER BY nodeLabels[0], display
          LIMIT $limit
          `,
        { label, limit: neo4j.int(limit) },
      );

      return NextResponse.json({
        total: numberValue(totalResult.records[0]?.get('total')),
        labels: labelResult.records.map((record) => ({
          label: String(record.get('label')),
          count: numberValue(record.get('count')),
        })),
        nodes: nodeResult.records.map((record) => ({
          elementId: String(record.get('elementId')),
          display: String(record.get('display')),
          labels: record.get('labels') as string[],
          properties: cleanProperties(record.get('props')),
          incoming: numberValue(record.get('incoming')),
          outgoing: numberValue(record.get('outgoing')),
        })),
      });
    } finally {
      await session.close();
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  } finally {
    await driver.close();
  }
}

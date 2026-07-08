#!/usr/bin/env -S npx --prefix services/sensor tsx
/**
 * Import RescueOps++ code graph rows from CSV/TSV into Neo4j.
 *
 * Input columns:
 * - type: required; one of function, test, calls, tests
 * - name: Function/Test display name; required for function rows, optional for test rows
 * - file: source/test file path; required for function and test rows
 * - from: caller Function name; required for calls rows
 * - to: callee Function name; required for calls rows
 * - test: Test file path; required for tests rows
 * - fn: covered Function name; required for tests rows
 * - status: optional; unknown, passing, or failing
 * - changed: optional for Function rows; true/false
 *
 * Sample:
 *   npx --prefix services/sensor tsx scripts/import-codegraph.ts --input ./codegraph.tsv --format tsv
 */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Args = {
  input?: string;
  format: 'auto' | 'csv' | 'tsv';
  batchSize: number;
  timeoutMs: number;
  connectTimeoutMs: number;
  envFile: string;
  dryRun: boolean;
  help: boolean;
};

type RawRow = Record<string, string>;

type FunctionRow = {
  name: string;
  file: string;
  status: Status | null;
  changed: boolean | null;
};

type TestRow = {
  name: string;
  file: string;
  status: Status | null;
};

type CallRow = {
  from: string;
  to: string;
};

type TestsRow = {
  test: string;
  name: string;
  fn: string;
};

type Status = 'unknown' | 'passing' | 'failing';

type Neo4jDriver = {
  verifyConnectivity: () => Promise<void>;
  close: () => Promise<void>;
};

type Neo4jTransaction = {
  run: (query: string, params: unknown) => Promise<unknown>;
};

type Neo4jSession = {
  executeWrite: (
    work: (tx: Neo4jTransaction) => Promise<void>,
    config: { timeout: number },
  ) => Promise<void>;
  close: () => Promise<void>;
};

const VALID_STATUSES = new Set<Status>(['unknown', 'passing', 'failing']);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

function printUsage(): void {
  console.log(`Import RescueOps++ CSV/TSV rows into Neo4j with MERGE.

Input columns:
  type      required; function | test | calls | tests
  name      Function/Test display name; required for function, optional for test
  file      source/test file path; required for function and test
  from      caller Function name; required for calls
  to        callee Function name; required for calls
  test      Test file path; required for tests
  fn        covered Function name; required for tests
  status    optional; unknown | passing | failing
  changed   optional for Function rows; true | false

Options:
  --input <path>              CSV/TSV file with a header row
  --format <auto|csv|tsv>     default: auto
  --batch-size <n>            default: 500
  --timeout-ms <n>            Neo4j transaction timeout per batch, default: 30000
  --connect-timeout-ms <n>    Neo4j connectivity timeout, default: 15000
  --env-file <path>           default: ${path.relative(process.cwd(), path.join(REPO_ROOT, '.env'))}
  --dry-run                   parse and validate without writing to Neo4j
  --help

Sample:
  npx --prefix services/sensor tsx scripts/import-codegraph.ts --input ./codegraph.tsv --format tsv
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    format: 'auto',
    batchSize: 500,
    timeoutMs: 30_000,
    connectTimeoutMs: 15_000,
    envFile: path.join(REPO_ROOT, '.env'),
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const equalsAt = token.indexOf('=');
    const name = equalsAt === -1 ? token : token.slice(0, equalsAt);
    const inlineValue = equalsAt === -1 ? undefined : token.slice(equalsAt + 1);

    const value = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      i += 1;
      const next = argv[i];
      if (!next) throw new Error(`${name} requires a value`);
      return next;
    };

    switch (name) {
      case '--input':
        args.input = value();
        break;
      case '--format': {
        const v = value();
        if (v !== 'auto' && v !== 'csv' && v !== 'tsv') {
          throw new Error('--format must be auto, csv, or tsv');
        }
        args.format = v;
        break;
      }
      case '--batch-size':
        args.batchSize = parsePositiveInteger(value(), '--batch-size');
        break;
      case '--timeout-ms':
        args.timeoutMs = parsePositiveInteger(value(), '--timeout-ms');
        break;
      case '--connect-timeout-ms':
        args.connectTimeoutMs = parsePositiveInteger(value(), '--connect-timeout-ms');
        break;
      case '--env-file':
        args.envFile = path.resolve(value());
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return args;
}

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

async function loadEnvFile(file: string): Promise<void> {
  try {
    await access(file);
  } catch {
    return;
  }

  const content = await readFile(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = stripEnvValue(rawValue);
  }
}

function stripEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  const commentStart = trimmed.indexOf(' #');
  return commentStart === -1 ? trimmed : trimmed.slice(0, commentStart).trim();
}

function detectDelimiter(inputPath: string, content: string, format: Args['format']): ',' | '\t' {
  if (format === 'csv') return ',';
  if (format === 'tsv') return '\t';

  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.csv') return ',';
  if (ext === '.tsv' || ext === '.tab') return '\t';

  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const tabs = [...firstLine].filter((c) => c === '\t').length;
  const commas = [...firstLine].filter((c) => c === ',').length;
  return tabs > commas ? '\t' : ',';
}

function parseDelimited(content: string, delimiter: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      if (content[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (inQuotes) throw new Error('Input ended while inside a quoted field');
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function rowsToObjects(rows: string[][]): RawRow[] {
  if (rows.length === 0) throw new Error('Input is empty');

  const headers = rows[0]!.map((header) => normalizeHeader(header));
  if (headers.some((h) => h === '')) throw new Error('Header row contains an empty column name');

  const seen = new Set<string>();
  for (const header of headers) {
    if (seen.has(header)) throw new Error(`Duplicate input column: ${header}`);
    seen.add(header);
  }

  return rows.slice(1).map((row) => {
    const record: RawRow = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]!] = (row[i] ?? '').trim();
    }
    return record;
  });
}

function normalizeHeader(header: string): string {
  return header.trim().replace(/^\uFEFF/, '').toLowerCase();
}

function normalizeRows(rows: RawRow[]): {
  functions: FunctionRow[];
  tests: TestRow[];
  calls: CallRow[];
  testsEdges: TestsRow[];
} {
  const normalized = {
    functions: [] as FunctionRow[],
    tests: [] as TestRow[],
    calls: [] as CallRow[],
    testsEdges: [] as TestsRow[],
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const type = readRequired(row, ['type', 'kind', 'record_type', 'row_type'], rowNumber).toLowerCase();

    switch (type) {
      case 'function':
      case 'fn':
        normalized.functions.push({
          name: readRequired(row, ['name'], rowNumber),
          file: readRequired(row, ['file'], rowNumber),
          status: readStatus(row, rowNumber),
          changed: readChanged(row, rowNumber),
        });
        break;
      case 'test':
        normalized.tests.push({
          file: readRequired(row, ['file'], rowNumber),
          name: readOptional(row, ['name']) || path.basename(readRequired(row, ['file'], rowNumber)),
          status: readStatus(row, rowNumber),
        });
        break;
      case 'call':
      case 'calls':
        normalized.calls.push({
          from: readRequired(row, ['from'], rowNumber),
          to: readRequired(row, ['to'], rowNumber),
        });
        break;
      case 'tests':
      case 'test_edge':
      case 'testedge':
        normalized.testsEdges.push({
          test: readRequired(row, ['test'], rowNumber),
          name: readOptional(row, ['name']) || path.basename(readRequired(row, ['test'], rowNumber)),
          fn: readRequired(row, ['fn', 'function'], rowNumber),
        });
        break;
      default:
        throw new Error(
          `Row ${rowNumber}: unknown type "${type}". Expected function, test, calls, or tests.`,
        );
    }
  });

  return normalized;
}

function readRequired(row: RawRow, names: string[], rowNumber: number): string {
  const value = readOptional(row, names);
  if (!value) throw new Error(`Row ${rowNumber}: missing required column ${names.join('/')}`);
  return value;
}

function readOptional(row: RawRow, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

function readStatus(row: RawRow, rowNumber: number): Status | null {
  const raw = readOptional(row, ['status']).toLowerCase();
  if (!raw) return null;
  if (VALID_STATUSES.has(raw as Status)) return raw as Status;
  throw new Error(`Row ${rowNumber}: status must be unknown, passing, or failing`);
}

function readChanged(row: RawRow, rowNumber: number): boolean | null {
  const raw = readOptional(row, ['changed']).toLowerCase();
  if (!raw) return null;
  if (['true', 't', '1', 'yes', 'y'].includes(raw)) return true;
  if (['false', 'f', '0', 'no', 'n'].includes(raw)) return false;
  throw new Error(`Row ${rowNumber}: changed must be true or false`);
}

function chunk<T>(rows: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    chunks.push(rows.slice(i, i + batchSize));
  }
  return chunks;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function importRows(
  driver: Neo4jDriver,
  openSession: (driver: Neo4jDriver) => Neo4jSession,
  rows: ReturnType<typeof normalizeRows>,
  batchSize: number,
  timeoutMs: number,
): Promise<void> {
  const session = openSession(driver);
  try {
    await runBatches(
      session,
      'Function',
      rows.functions,
      batchSize,
      timeoutMs,
      `UNWIND $rows AS row
       MERGE (f:Function {name: row.name})
       ON CREATE SET f.status = 'unknown', f.changed = false
       SET f.file = row.file
       FOREACH (_ IN CASE WHEN row.status IS NULL THEN [] ELSE [1] END | SET f.status = row.status)
       FOREACH (_ IN CASE WHEN row.changed IS NULL THEN [] ELSE [1] END | SET f.changed = row.changed)`,
    );

    await runBatches(
      session,
      'Test',
      rows.tests,
      batchSize,
      timeoutMs,
      `UNWIND $rows AS row
       MERGE (t:Test {file: row.file})
       ON CREATE SET t.status = 'unknown'
       SET t.name = row.name
       FOREACH (_ IN CASE WHEN row.status IS NULL THEN [] ELSE [1] END | SET t.status = row.status)`,
    );

    await runBatches(
      session,
      'CALLS',
      rows.calls,
      batchSize,
      timeoutMs,
      `UNWIND $rows AS row
       MERGE (a:Function {name: row.from})
       ON CREATE SET a.status = 'unknown', a.changed = false
       MERGE (b:Function {name: row.to})
       ON CREATE SET b.status = 'unknown', b.changed = false
       MERGE (a)-[:CALLS]->(b)`,
    );

    await runBatches(
      session,
      'TESTS',
      rows.testsEdges,
      batchSize,
      timeoutMs,
      `UNWIND $rows AS row
       MERGE (t:Test {file: row.test})
       ON CREATE SET t.status = 'unknown'
       SET t.name = row.name
       MERGE (f:Function {name: row.fn})
       ON CREATE SET f.status = 'unknown', f.changed = false
       MERGE (t)-[:TESTS]->(f)`,
    );
  } finally {
    await session.close();
  }
}

async function runBatches<T>(
  session: Neo4jSession,
  label: string,
  rows: T[],
  batchSize: number,
  timeoutMs: number,
  cypher: string,
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    await session.executeWrite(
      async (tx) => {
        await tx.run(cypher, { rows: batch });
      },
      { timeout: timeoutMs },
    );
    console.log(`merged ${label}: ${batch.length}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.input) throw new Error('--input is required');

  const inputPath = path.resolve(args.input);
  const content = await readFile(inputPath, 'utf8');
  const delimiter = detectDelimiter(inputPath, content, args.format);
  const rawRows = rowsToObjects(parseDelimited(content, delimiter));
  const rows = normalizeRows(rawRows);

  const counts = {
    functions: rows.functions.length,
    tests: rows.tests.length,
    calls: rows.calls.length,
    tests_edges: rows.testsEdges.length,
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ status: 'dry_run_ok', delimiter, counts }, null, 2));
    return;
  }

  await loadEnvFile(args.envFile);
  const { createDriver, openSession } = await import('../services/sensor/src/neo4j-config.js');
  const driver = createDriver();

  try {
    await withTimeout(driver.verifyConnectivity(), args.connectTimeoutMs, 'Neo4j connectivity check');
    await importRows(driver, openSession, rows, args.batchSize, args.timeoutMs);
    console.log(JSON.stringify({ status: 'imported', delimiter, counts }, null, 2));
  } finally {
    await driver.close();
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`import-codegraph failed: ${message}`);
  process.exitCode = 1;
});

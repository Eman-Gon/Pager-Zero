import path from 'node:path';
import type { Driver } from 'neo4j-driver';
import { openSession } from './neo4j-config.js';
import { FunctionDeclaration, Node, Project, SyntaxKind } from 'ts-morph';

export interface CodeGraph {
  functions: { name: string; file: string }[];
  calls: { from: string; to: string }[];
  tests: { name: string; file: string }[];
  testsEdges: { test: string; fn: string }[];
}

export function analyzeTarget(targetDir: string): CodeGraph {
  const project = new Project({ tsConfigFilePath: path.join(targetDir, 'tsconfig.json') });
  const rel = (p: string) => path.relative(targetDir, p);
  const files = project.getSourceFiles();
  const srcFiles = files.filter((f) => rel(f.getFilePath()).startsWith('src/'));
  const testFiles = files.filter((f) => rel(f.getFilePath()).startsWith('test/'));

  const fnInfo = new Map<FunctionDeclaration, { name: string; file: string }>();
  for (const file of srcFiles) {
    for (const fn of file.getFunctions()) {
      const name = fn.getName();
      if (fn.isExported() && name) fnInfo.set(fn, { name, file: rel(file.getFilePath()) });
    }
  }

  const calls: { from: string; to: string }[] = [];
  const seenCalls = new Set<string>();
  for (const [decl, info] of fnInfo) {
    for (const call of decl.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const sym = call.getExpression().getSymbol();
      const resolved = sym?.getAliasedSymbol() ?? sym;
      for (const d of resolved?.getDeclarations() ?? []) {
        if (Node.isFunctionDeclaration(d) && fnInfo.has(d)) {
          const to = fnInfo.get(d)!.name;
          if (to !== info.name && !seenCalls.has(`${info.name}->${to}`)) {
            seenCalls.add(`${info.name}->${to}`);
            calls.push({ from: info.name, to });
          }
        }
      }
    }
  }

  const fnNames = new Set([...fnInfo.values()].map((v) => v.name));
  const tests: { name: string; file: string }[] = [];
  const testsEdges: { test: string; fn: string }[] = [];
  for (const file of testFiles) {
    const testFile = rel(file.getFilePath());
    tests.push({ name: path.basename(testFile), file: testFile });
    for (const imp of file.getImportDeclarations()) {
      const importedFile = imp.getModuleSpecifierSourceFile();
      if (!importedFile || !rel(importedFile.getFilePath()).startsWith('src/')) continue;
      for (const named of imp.getNamedImports()) {
        if (fnNames.has(named.getName())) testsEdges.push({ test: testFile, fn: named.getName() });
      }
    }
  }

  return { functions: [...fnInfo.values()], calls, tests, testsEdges };
}

// Remove the previously-built code graph (Function/Test nodes and their edges)
// so a reload for a different target repo starts clean. Runbook and other nodes
// are left untouched.
export async function clearCodeGraph(driver: Driver): Promise<void> {
  const session = openSession(driver);
  try {
    await session.run(`MATCH (n:Function) DETACH DELETE n`);
    await session.run(`MATCH (n:Test) DETACH DELETE n`);
  } finally {
    await session.close();
  }
}

export async function writeCodeGraph(driver: Driver, g: CodeGraph): Promise<void> {
  const session = openSession(driver);
  try {
    await session.executeWrite(async (tx) => {
      for (const f of g.functions) {
        await tx.run(
          `MERGE (f:Function {name: $name})
           ON CREATE SET f.status = 'unknown', f.changed = false
           SET f.file = $file`,
          f,
        );
      }
      for (const t of g.tests) {
        await tx.run(
          `MERGE (t:Test {file: $file})
           ON CREATE SET t.status = 'unknown'
           SET t.name = $name`,
          t,
        );
      }
      for (const c of g.calls) {
        await tx.run(
          `MATCH (a:Function {name: $from}), (b:Function {name: $to})
           MERGE (a)-[:CALLS]->(b)`,
          c,
        );
      }
      for (const e of g.testsEdges) {
        await tx.run(
          `MATCH (t:Test {file: $test}), (f:Function {name: $fn})
           MERGE (t)-[:TESTS]->(f)`,
          e,
        );
      }
    });
  } finally {
    await session.close();
  }
}

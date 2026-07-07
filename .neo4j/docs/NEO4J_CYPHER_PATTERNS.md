# Cypher Patterns in RescueOps++

Exact queries used by the sensor and responder. Copy-paste into Neo4j Browser (`:7474`) to inspect state.

## Code graph — build (sensor startup)

```cypher
// Functions
MERGE (f:Function {name: $name})
ON CREATE SET f.status = 'unknown', f.changed = false
SET f.file = $file

// Tests
MERGE (t:Test {file: $file})
ON CREATE SET t.status = 'unknown'
SET t.name = $name

// Call edges
MATCH (a:Function {name: $from}), (b:Function {name: $to})
MERGE (a)-[:CALLS]->(b)

// Test → function edges
MATCH (t:Test {file: $test}), (f:Function {name: $fn})
MERGE (t)-[:TESTS]->(f)
```

## Status updates (sensor poll loop)

```cypher
// Test pass/fail from vitest JSON
UNWIND $tests AS t
MATCH (test:Test {file: t.file})
SET test.status = t.status

// Function status = failing if any TESTS edge points to a failing test
MATCH (f:Function)
MATCH (t:Test)-[:TESTS]->(f)
WITH f, collect(t.status) AS statuses
SET f.status = CASE
  WHEN any(s IN statuses WHERE s = 'failing') THEN 'failing'
  ELSE 'passing'
END

// Changed flag from git diff good..HEAD
MATCH (f:Function)
SET f.changed = f.file IN $changedFiles
```

## Root cause (sensor GET /incident)

The changed function that is failing and does **not** call another changed failing function:

```cypher
MATCH (f:Function {changed: true, status: 'failing'})
WHERE NOT EXISTS {
  MATCH (f)-[:CALLS]->(:Function {changed: true})
}
RETURN f.name AS root_cause
```

## Blast radius

All functions that transitively call the root:

```cypher
MATCH (caller:Function)-[:CALLS*]->(root:Function {name: $root})
RETURN DISTINCT caller.name AS affected
```

## Runbook substrate (responder)

```cypher
MERGE (r:Runbook {title: $title})
SET r.text = $text

MATCH (r:Runbook {title: $title}), (f:Function {name: $fn})
MERGE (r)-[:APPLIES_TO]->(f)
```

## Vector index (responder)

```cypher
DROP INDEX runbook_vec IF EXISTS;

CREATE VECTOR INDEX runbook_vec IF NOT EXISTS
FOR (r:Runbook) ON (r.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: $dim,
    `vector.similarity_function`: 'cosine'
  }
};

CALL db.awaitIndex('runbook_vec');
```

## Runbook retrieval — graph-aware vector search

Vector similarity, boosted when the runbook `APPLIES_TO` the incident's root-cause function:

```cypher
CALL db.index.vector.queryNodes($index, 5, $queryEmbedding)
YIELD node, score
OPTIONAL MATCH (node)-[:APPLIES_TO]->(f:Function {name: $rootCause})
RETURN node.title AS title, node.text AS text, score, f IS NOT NULL AS applies
ORDER BY applies DESC, score DESC
LIMIT 3
```

## Useful inspection queries

```cypher
// Full code graph
MATCH (f:Function)-[r]->(g)
RETURN f, r, g;

// Failing tests and what they cover
MATCH (t:Test {status: 'failing'})-[:TESTS]->(f:Function)
RETURN t.file, f.name, f.changed;

// Runbooks linked to computeTax
MATCH (r:Runbook)-[:APPLIES_TO]->(f:Function {name: 'computeTax'})
RETURN r.title, r.text;
```

# Neo4j Vector Indexes in RescueOps++

RescueOps++ uses Neo4j 5 **vector indexes** for runbook retrieval (M3 Phase 2). Embeddings come from **Nebius Token Factory**; the responder stores them on `(:Runbook)` nodes and queries via `db.index.vector.queryNodes`.

## Index definition

Created in `services/responder/src/runbooks.ts`:

```cypher
CREATE VECTOR INDEX runbook_vec IF NOT EXISTS
FOR (r:Runbook) ON (r.embedding)
OPTIONS {
  indexConfig: {
    `vector.dimensions`: <Nebius model dimension>,
    `vector.similarity_function`: 'cosine'
  }
}
```

The index is **recreated** when the Nebius embedding model changes (dimension mismatch would break queries). `CALL db.awaitIndex('runbook_vec')` blocks until the index is online.

## Node properties

| Property | Type | Set by |
| -------- | ---- | ------ |
| `embedding` | `LIST<FLOAT>` | Nebius `/embeddings` API |
| `embedding_model` | string | Model ID used (staleness check) |
| `title` | string | Runbook seed data |
| `text` | string | Runbook prose (also embedded) |

## Query procedure

```cypher
CALL db.index.vector.queryNodes('runbook_vec', $k, $queryVector)
YIELD node, score
```

- `$k` — number of nearest neighbors (project uses 5, returns top 3 after re-ranking)
- `$queryVector` — embedding of the incident query string (built from root cause + failing tests + blast radius)
- `score` — cosine similarity (higher = closer)

## Graph-aware re-ranking

Vector search alone might return a generic runbook. RescueOps++ boosts runbooks with an `APPLIES_TO` edge to the incident's `root_cause` function:

```cypher
ORDER BY applies DESC, score DESC
```

So for the seeded `computeTax` wrong-operator incident, the "Wrong operator in arithmetic computation" runbook (linked to `computeTax`) ranks above vector-only matches.

## Prerequisites

```env
NEBIUS_API_KEY=
NEBIUS_EMBED_MODEL=        # Confirm current model ID at tokenfactory.nebius.com
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
```

Without Nebius configured:
- Runbook **nodes** and `APPLIES_TO` edges are still seeded
- Embeddings and vector index are skipped
- `retrieveRunbooks()` returns `null`; diagnosis proceeds without runbooks

## Verify vector search

```cypher
// Check embeddings exist
MATCH (r:Runbook)
RETURN r.title, size(r.embedding) AS dim, r.embedding_model;

// Check index
SHOW INDEXES YIELD name, type, state
WHERE name = 'runbook_vec';

// Manual query (replace $vec with a real embedding list)
CALL db.index.vector.queryNodes('runbook_vec', 3, $vec)
YIELD node, score
RETURN node.title, score;
```

## Official Neo4j documentation

- Vector indexes overview: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/
- `db.index.vector.queryNodes`: https://neo4j.com/docs/operations-manual/current/procedures/
- Vector index configuration: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/#indexes-vector-create

## Common mistakes

1. **Wrong dimension** — index dimension must exactly match the embedding model output; the project drops and recreates the index on model change
2. **Querying before `db.awaitIndex`** — searches on a populating index return incomplete results
3. **Passing a string instead of a float list** — `$queryVector` must be `LIST<FLOAT>`, not a JSON string
4. **Forgetting cosine vs euclidean** — this project uses `cosine`; changing similarity function requires index recreation

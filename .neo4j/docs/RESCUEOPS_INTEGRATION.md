# Neo4j in RescueOps++

Neo4j runs locally in Docker Compose. Two services connect to it: the **sensor** (code graph + incident detection) and the **responder** (runbook GraphRAG). The **frontend** reads the graph live for visualization.

## Architecture

```
target-repo ──ts-morph──► sensor ──MERGE/SET──► Neo4j
                              │
                              └── GET /incident (root cause + blast radius)

Nebius embeddings ──► responder/runbooks.ts ──vector index──► Neo4j
                                                      │
responder/diagnose ◄── retrieveRunbooks() ◄─────────────┘

frontend/GraphPanel.tsx ──bolt://──► Neo4j (browser driver)
```

## Docker Compose

```yaml
neo4j:
  image: neo4j:5
  environment:
    NEO4J_AUTH: neo4j/devpassword
  ports:
    - "7474:7474"   # Browser UI
    - "7687:7687"   # Bolt
```

Both `sensor` and `responder` connect to `bolt://neo4j:7687` with retry logic (~60s) for Neo4j startup.

## Environment variables

```env
NEO4J_URL=bolt://neo4j:7687      # bolt://localhost:7687 outside Docker
NEO4J_USER=neo4j
NEO4J_PASSWORD=devpassword
```

Frontend (`GraphPanel.tsx`):

```env
VITE_NEO4J_URL=bolt://localhost:7687
VITE_NEO4J_USER=neo4j
VITE_NEO4J_PASSWORD=devpassword
```

## Graph schema

### Code graph (sensor — M2)

Built once on startup from `target-repo` via ts-morph, then status/changed flags updated on each git HEAD change.

| Node | Properties | Source |
| ---- | ---------- | ------ |
| `(:Function)` | `name`, `file`, `status`, `changed` | Exported functions in `src/` |
| `(:Test)` | `name`, `file`, `status` | Test files in `test/` |

| Relationship | Meaning |
| ------------ | ------- |
| `(:Function)-[:CALLS]->(:Function)` | Direct function call (type-resolved) |
| `(:Test)-[:TESTS]->(:Function)` | Test file imports function from `src/` |

`status` ∈ `passing` | `failing` | `unknown` — driven by vitest JSON reporter results.

### Runbook substrate (responder — M3)

| Node | Properties |
| ---- | ---------- |
| `(:Runbook)` | `title`, `text`, `embedding`, `embedding_model` |

| Relationship | Meaning |
| ------------ | ------- |
| `(:Runbook)-[:APPLIES_TO]->(:Function)` | Runbook relevant to a function (e.g. wrong-operator → `computeTax`) |

Vector index `runbook_vec` on `Runbook.embedding` (cosine similarity, dimension matches Nebius model).

## Key files

| File | Role |
| ---- | ---- |
| `services/sensor/src/codegraph.ts` | Static analysis → `MERGE` graph |
| `services/sensor/src/scan.ts` | Poll git HEAD, run vitest, update status/changed |
| `services/sensor/src/index.ts` | `GET /incident` with root-cause Cypher |
| `services/responder/src/runbooks.ts` | Seed runbooks, vector index, retrieval |
| `services/responder/src/context.ts` | Read function source from graph |
| `frontend/src/panels/GraphPanel.tsx` | Live graph visualization |

## Verify Neo4j is working

```bash
docker compose up --build

# Browser: http://localhost:7474 (neo4j / devpassword)
# Cypher:
MATCH (f:Function) RETURN f.name, f.status, f.changed;
MATCH (f:Function)-[:CALLS]->(g:Function) RETURN f.name, g.name;

# Incident endpoint:
curl http://localhost:3003/incident

# With seeded incident:
./scripts/break.sh
curl http://localhost:3003/incident
# → root_cause: "computeTax", blast_radius includes invoiceTotal, renderInvoice
```

## Common issues

- **Sensor starts before graph is ready** — both services retry Bolt connect up to 30 × 2s
- **Empty graph** — `target-repo/` must exist and contain the M1 library + tests
- **Frontend shows "neo4j unreachable"** — Bolt from browser needs `bolt://localhost:7687`; falls back to incident subgraph
- **No runbook retrieval** — requires `NEBIUS_API_KEY` + `NEBIUS_EMBED_MODEL`; diagnosis still works without runbooks

## Official resources

- Cypher manual: https://neo4j.com/docs/cypher-manual/current/
- JavaScript driver: https://neo4j.com/docs/javascript-manual/current/
- Vector indexes: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/

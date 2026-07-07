# Neo4j

## When to Use Neo4j in RescueOps++

Neo4j is the graph database behind RescueOps++'s code intelligence layer (M2) and runbook retrieval (M3). It answers: *which function broke, what's the blast radius, and which runbook applies?*

## Documentation in this repo

| File | Read when... |
| ---- | ------------ |
| [RESCUEOPS_INTEGRATION.md](./RESCUEOPS_INTEGRATION.md) | Working on sensor, responder, or graph UI in this project |
| [NEO4J_CYPHER_PATTERNS.md](./NEO4J_CYPHER_PATTERNS.md) | Writing or debugging Cypher queries used here |
| [NEO4J_VECTOR_INDEXES.md](./NEO4J_VECTOR_INDEXES.md) | Runbook embedding search (GraphRAG) |
| [NEO4J_DRIVER_README.md](./NEO4J_DRIVER_README.md) | `neo4j-driver` npm package (Node + browser) |

## Before writing Neo4j code

1. Read [RESCUEOPS_INTEGRATION.md](./RESCUEOPS_INTEGRATION.md) for schema and service wiring
2. Read [NEO4J_CYPHER_PATTERNS.md](./NEO4J_CYPHER_PATTERNS.md) for the exact traversals this project uses
3. For vector search changes, read [NEO4J_VECTOR_INDEXES.md](./NEO4J_VECTOR_INDEXES.md)

## Official resources

- Neo4j Browser (local): http://localhost:7474
- Cypher manual: https://neo4j.com/docs/cypher-manual/current/
- JavaScript driver manual: https://neo4j.com/docs/javascript-manual/current/
- Driver API: https://neo4j.com/docs/api/javascript-driver/current/
- Vector indexes: https://neo4j.com/docs/cypher-manual/current/indexes/semantic-indexes/vector-indexes/

---
description: Use when working with Neo4j graph schema, Cypher queries, or vector indexes
globs: ['**/*codegraph*', '**/*runbooks*', '**/scan.ts', '**/GraphPanel.tsx']
---

<!-- NEO4J:BEGIN -->

# Neo4j: Code Graph + Runbook Vector Search

Use Neo4j for the RescueOps++ code dependency graph (M2) and runbook GraphRAG (M3).

## Documentation

Full docs: `.neo4j/docs/`

**Read the relevant doc(s) before generating any Neo4j/Cypher code.**

| File | Read when... |
| ---- | ------------ |
| NEO4J_README.md | Starting Neo4j work: overview + doc index |
| RESCUEOPS_INTEGRATION.md | This project's schema, services, and env vars |
| NEO4J_CYPHER_PATTERNS.md | Root-cause traversal, status updates, runbook queries |
| NEO4J_VECTOR_INDEXES.md | Runbook embedding index and vector search |
| NEO4J_DRIVER_README.md | `neo4j-driver` npm package (Node + browser) |

## Before Writing ANY Neo4j Code

1. Read `.neo4j/docs/RESCUEOPS_INTEGRATION.md` for node labels and relationships
2. Read `.neo4j/docs/NEO4J_CYPHER_PATTERNS.md` before changing traversals
3. For vector index changes, read `.neo4j/docs/NEO4J_VECTOR_INDEXES.md`
<!-- NEO4J:END -->

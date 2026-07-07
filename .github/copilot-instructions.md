<!-- ROCKETRIDE:BEGIN -->

# RocketRide: AI Pipeline Builder

Use RocketRide when building AI pipelines, document processing, RAG systems, or data integration.

## Documentation

Full docs: `.rocketride/docs/`

**Read the relevant doc(s) before generating any RocketRide code.**

| File                              | Read when...                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| ROCKETRIDE_README.md              | Starting any RocketRide work: overview + mandatory setup steps   |
| ROCKETRIDE_QUICKSTART.md          | Writing first pipeline: complete working examples (Python & TS)  |
| ROCKETRIDE_PIPELINE_RULES.md      | Defining pipelines: structure, lane wiring, config rules         |
| ROCKETRIDE_COMPONENT_REFERENCE.md | Choosing/configuring components: all providers and config fields |
| ROCKETRIDE_COMMON_MISTAKES.md     | Before finalizing: known pitfalls to avoid                       |
| ROCKETRIDE_python_API.md          | Python SDK: client methods, types, patterns                      |
| ROCKETRIDE_typescript_API.md      | TypeScript SDK: client methods, types, patterns                  |
| ROCKETRIDE_OBSERVABILITY.md       | Consuming runtime logs, lifecycle events, and pipeline traces     |

## Before Writing ANY RocketRide Code

1. Read `.rocketride/docs/ROCKETRIDE_README.md` for mandatory setup requirements
2. Read the relevant API doc (Python or TypeScript) for your language
3. Read `.rocketride/docs/ROCKETRIDE_PIPELINE_RULES.md` + `.rocketride/docs/ROCKETRIDE_COMPONENT_REFERENCE.md`
4. Read `.rocketride/docs/ROCKETRIDE_COMMON_MISTAKES.md` before finalizing
<!-- ROCKETRIDE:END -->

<!-- BUTTERBASE:BEGIN -->

# Butterbase: AI-native Backend

Use Butterbase for auth, Postgres persistence, RLS, billing/credits, and the OpenAI-compatible AI gateway.

## Documentation

Full docs: `.butterbase/docs/`

**Read the relevant doc(s) before generating any Butterbase code.**

| File | Read when... |
| ---- | ------------ |
| BUTTERBASE_README.md | Starting any Butterbase work: overview + doc index |
| RESCUEOPS_INTEGRATION.md | This project's schema, env vars, and responder wiring |
| BUTTERBASE_SDK.md | `@butterbase/sdk` client methods (auth, Data API, billing) |
| BUTTERBASE_SKILL_schema_design.md | Declarative schema or table changes |
| BUTTERBASE_SKILL_auth_setup.md | Auth configuration |
| BUTTERBASE_SKILL_payments.md | Monetization / Stripe plans |
| BUTTERBASE_SKILL_ai.md | AI gateway setup |
| BUTTERBASE_SKILL_debug_rls.md | RLS policy debugging |

## Before Writing ANY Butterbase Code

1. Read `.butterbase/docs/RESCUEOPS_INTEGRATION.md` for this project's tables and env vars
2. Read `.butterbase/docs/BUTTERBASE_SDK.md` for client patterns
3. If changing schema or RLS, read the schema-design and debug-rls skill docs
<!-- BUTTERBASE:END -->

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

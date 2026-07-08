# RescueOps++ (Pager-Zero)

Autonomous on-call engineer: watches a codebase, detects broken commits, diagnoses root cause via a code graph + AI, verifies fixes in a sandbox, and ships PRs.

## Stack

| Service | Port | Role |
| ------- | ---- | ---- |
| `sensor` | 3003 | Static code graph (Neo4j), incident detection |
| `responder` | 3004 | AI diagnosis, sandbox verify, policy gate, GitHub PR |
| `neo4j` | 7474 / 7687 | Code graph + runbook vector index |
| `memory` | 3005 | Cognee semantic memory → Neo4j (optional, compose profile `memory`) |
| `frontend` | 5173 (dev) | Mission Control dashboard |

## Quick start

1. Copy `.env.example` → `.env` and fill in API keys.
2. Create the target repo (M1) or clone a patient codebase into `./target-repo`.
3. Start the stack (pick one):

**Docker (one command)** — sensor + responder + Mission Control UI:

```bash
./scripts/docker-up.sh        # foreground
./scripts/docker-up.sh -d     # detached
```

Reads API keys from `.env`. Optional profile: `--profile local-neo4j`.

**Native (no Docker)** — uses Neo4j Aura / keys from `.env`:

```bash
./scripts/dev-native.sh
```

4. Seed an incident and diagnose:

```bash
./scripts/break.sh
curl http://localhost:3004/connection   # proves LLM gateway is configured
curl -X POST http://localhost:3004/diagnose
```

5. UI: http://localhost:5173 (Docker `./scripts/docker-up.sh` or native `./scripts/dev-native.sh`).

**Butterbase hosting (live URL):** build and deploy Mission Control to Butterbase Pages:

```bash
# Expose sensor (:3003) + responder (:3004) publicly first (VPS or tunnel), then:
NEXT_PUBLIC_SENSOR_URL=https://your-host:3003 \
NEXT_PUBLIC_RESPONDER_URL=https://your-host:3004 \
./scripts/deploy-frontend.sh
```

## Autonomous mode

By default RescueOps++ waits for a click in Mission Control (`/diagnose`, `/remediate`, `/apply`). Set `AUTONOMOUS=1` in `.env` to make the responder a true autonomous on-call engineer: it watches the sensor and, the moment a new incident appears, runs **diagnose → remediate → apply** itself — no human in the loop. It acts as the service account (`SERVICE_EMAIL` / `SERVICE_PASSWORD`, defaulting to the demo on-call user), so incidents and actions persist under RLS exactly as an operator's would, and the policy gate still applies: risky fixes park as pending approvals rather than auto-shipping a PR. Requires Butterbase to be configured. Tune the watch cadence with `AUTONOMOUS_POLL_MS` (default 5000).

## LLM diagnosis

Diagnosis is a direct OpenAI-compatible `chat/completions` call — context assembled in the responder, JSON diagnosis returned.

| Provider | `LLM_PROVIDER` | Keys |
| -------- | -------------- | ---- |
| Butterbase gateway (default) | `butterbase` | `BUTTERBASE_API_KEY`, `BUTTERBASE_GATEWAY_URL` |
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Nebius | `nebius` | `NEBIUS_API_KEY`, `NEBIUS_CHAT_MODEL` |

Implementation: `services/responder/src/pipeline.ts`.

## Butterbase (auth, DB, credits, AI gateway)

Butterbase is the product backend: users sign in, incidents/actions persist under RLS, shipping costs credits, and the diagnosis LLM runs through Butterbase's OpenAI-compatible gateway.

**Required keys** (in `.env`):

- `BUTTERBASE_APP_ID` — from [dashboard.butterbase.ai](https://dashboard.butterbase.ai)
- `BUTTERBASE_API_KEY` — personal key with `ai:gateway` scope
- `BUTTERBASE_GATEWAY_URL` — `https://api.butterbase.ai/v1`

**Docs in this repo:**

- [RescueOps++ integration guide](.butterbase/docs/RESCUEOPS_INTEGRATION.md) — schema, auth, credits, gateway wiring
- [Butterbase docs](.butterbase/docs/) — SDK reference, schema/auth/payments skills from upstream

**Official:** [docs.butterbase.ai](https://docs.butterbase.ai) · [GitHub](https://github.com/butterbase-ai/butterbase) · [Discord](https://discord.gg/Aq7q5mqbrt)

## Neo4j (code graph + runbook search)

Neo4j holds the code graph and runbook vector index. **Native dev** uses Aura credentials from `.env` (`NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`). **Docker** can optionally run a local instance on `--profile local-neo4j`.

**CLI:**

```bash
./scripts/cypher-shell.sh          # uses .env (Aura or local)
```

**Local Docker Neo4j (optional):**

- Browser UI: http://localhost:7474 (`neo4j` / `devpassword`)
- Bolt: `bolt://localhost:7687`

**Docs in this repo:**

- [RescueOps++ integration guide](.neo4j/docs/RESCUEOPS_INTEGRATION.md) — schema, services, verification
- [Cypher patterns](.neo4j/docs/NEO4J_CYPHER_PATTERNS.md) — root-cause traversal, status updates
- [Vector indexes](.neo4j/docs/NEO4J_VECTOR_INDEXES.md) — runbook embedding search
- [Driver README](.neo4j/docs/NEO4J_DRIVER_README.md) — `neo4j-driver` npm package

**Official:** [Cypher manual](https://neo4j.com/docs/cypher-manual/current/) · [JS driver](https://neo4j.com/docs/javascript-manual/current/)

## Other integrations

| Provider | Used for | Env vars |
| -------- | -------- | -------- |
| Nebius | Runbook embeddings + optional diagnosis inference | `NEBIUS_*`, `LLM_PROVIDER` |
| Daytona | Sandbox test verification | `DAYTONA_*` |
| Cognee | Semantic memory → Neo4j (knowledge + episodic) | `MEMORY_URL`, `COGNEE_*` |
| GitHub | Fix PRs | `GITHUB_TOKEN`, `GITHUB_REPO` |

## Sponsor cross-integrations (opt-in)

Four sponsor-called-out integrations, each gated behind an env flag that **defaults to the existing behavior** — the baseline diagnose → verify → PR demo never changes unless you opt in.

| Integration | Prize(s) | Turn on with | What it does |
| ----------- | -------- | ------------ | ------------ |
| **Cognee → Neo4j** | Neo4j + Cognee | `docker compose --profile memory up`, `COGNEE_ENABLED=1` | The `memory` service cognifies the runbook corpus into a knowledge graph stored **in the same Neo4j** (distinct labels) and the responder recalls it at diagnosis time. Falls back to the built-in `runbook_vec` substrate when off. |
| **Cognee + Daytona memory** | Cognee + Daytona | `COGNEE_MEMORY_ENABLED=1` | Every shipped fix is remembered as a Cognee episode in Neo4j and recalled before future diagnoses — persistent agent memory that survives restarts and the disposable Daytona verify sandboxes. |
| **Nebius inference** | Nebius | `LLM_PROVIDER=nebius` | Routes diagnosis LLM through Nebius Token Factory (OpenAI-compatible), on top of the embeddings it already powers. |

See `.env.example` for every flag. The `memory` service is Python (Cognee is Python-native); the responder calls it over HTTP and degrades gracefully when it is absent.

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

**Native (no Docker)** — uses Neo4j Aura / keys from `.env`:

```bash
# Free ports if another project's Docker stack is using 3003/3004:
docker stop $(docker ps -q --filter publish=3003) $(docker ps -q --filter publish=3004) 2>/dev/null || true

./scripts/dev-native.sh
```

**Docker Compose** — optional local Neo4j via `--profile local-neo4j`:

```bash
docker compose up --build
```

4. Seed an incident and diagnose:

```bash
./scripts/break.sh
curl http://localhost:3004/connection   # proves RocketRide Cloud URI
curl -X POST http://localhost:3004/diagnose
```

5. UI: http://localhost:5173 (`dev-native.sh` starts it; with Docker-only, run `cd frontend && npm run dev`).

**Butterbase hosting (live URL):** build and deploy Mission Control to Butterbase Pages:

```bash
# Expose sensor (:3003) + responder (:3004) publicly first (VPS or tunnel), then:
VITE_SENSOR_URL=https://your-host:3003 \
VITE_RESPONDER_URL=https://your-host:3004 \
./scripts/deploy-frontend.sh
```

See `DEMO.md` for the on-stage runbook.

## Autonomous mode

By default RescueOps++ waits for a click in Mission Control (`/diagnose`, `/remediate`, `/apply`). Set `AUTONOMOUS=1` in `.env` to make the responder a true autonomous on-call engineer: it watches the sensor and, the moment a new incident appears, runs **diagnose → remediate → apply** itself — no human in the loop. It acts as the service account (`SERVICE_EMAIL` / `SERVICE_PASSWORD`, defaulting to the demo on-call user), so incidents and actions persist under RLS exactly as an operator's would, and the policy gate still applies: risky fixes park as pending approvals rather than auto-shipping a PR. Requires Butterbase to be configured. Tune the watch cadence with `AUTONOMOUS_POLL_MS` (default 5000).

## RocketRide (diagnosis pipeline)

RescueOps++ uses a **Cerberus-style** RocketRide setup: wave-planning agent first, simple prompt→LLM fallback.

| Pipeline | File | When |
| -------- | ---- | ---- |
| Native (optional) | `services/responder/rescueops-diagnose-native.pipe` | `RESCUEOPS_NATIVE_PIPELINE=1`; RocketRide native `db_neo4j` + `tool_butterbase` |
| Agent (primary) | `services/responder/rescueops-diagnose-agent.pipe` | `agent_rocketride` + Neo4j MCP + `memory_internal` + blast-radius scorer |
| Query (fallback) | `services/responder/rescueops-diagnose-query.pipe` | Pre-assembled context → prompt → Butterbase LLM |

SDK client: `services/responder/src/pipeline.ts` (loads native only when explicitly enabled, otherwise agent first, then query fallback).

**Required keys** (in `.env`):

- `ROCKETRIDE_APIKEY` — from [rocketride.ai](https://rocketride.ai) (optional for local engine)
- `ROCKETRIDE_URI` — `ws://localhost:5565` (local) or `https://api.rocketride.ai` (cloud)

**Optional (agent pipeline — same pattern as [Cerberus](https://github.com/kvn8888/Cerberus)):**

- `NEO4J_MCP_ENDPOINT` — neo4j-mcp HTTP bridge (default `http://localhost:8787/mcp`)
- `RESCUEOPS_AGENT_PIPELINE=0` — skip agent; use query fallback only
- `RESCUEOPS_NATIVE_PIPELINE=1` — try the native RocketRide pipe first; load failures or invalid answers fall back to the existing agent/query path

**Docs in this repo:**

- [RescueOps++ integration guide](.rocketride/docs/RESCUEOPS_INTEGRATION.md) — how this project uses RocketRide
- [RocketRide agent docs](.rocketride/docs/) — official SDK/pipeline reference for coding assistants

**Official:** [docs.rocketride.org](https://docs.rocketride.org/) · [GitHub](https://github.com/rocketride-org/rocketride-server) · [Discord](https://discord.gg/PMXrtenMsY)

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
| **RocketRide native tools** | RocketRide | `RESCUEOPS_NATIVE_PIPELINE=1` | Loads `rescueops-diagnose-native.pipe`, which reaches Neo4j via RocketRide's own `db_neo4j` component and adds `tool_butterbase` — all three tools running **inside** RocketRide. Falls through to the MCP agent pipe on any failure. |
| **Cognee + Daytona memory** | Cognee + Daytona | `COGNEE_MEMORY_ENABLED=1` | Every shipped fix is remembered as a Cognee episode in Neo4j and recalled before future diagnoses — persistent agent memory that survives restarts and the disposable Daytona verify sandboxes. |
| **Nebius inference** | Nebius | `LLM_PROVIDER=nebius` | Routes the RocketRide diagnosis LLM through Nebius Token Factory (OpenAI-compatible), on top of the embeddings it already powers. A Nebius Claude-Code proxy (point any CLI agent's OpenAI base URL at `NEBIUS_BASE_URL`) frees the coding agent from a single model provider. |

See `.env.example` for every flag. The `memory` service is Python (Cognee is Python-native); the responder calls it over HTTP and degrades gracefully when it is absent.

## Milestones

Build specs live in `claude-code-prompt-m1` through `m8` at the repo root. M1 = target repo, M2 = code graph, M3 = RocketRide diagnosis, M4 = Daytona verify, M5 = Butterbase backend, M6 = ship PR, M7 = approval gate, M8 = Mission Control UI.

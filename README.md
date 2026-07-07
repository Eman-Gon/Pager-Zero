# RescueOps++ (Pager-Zero)

Autonomous on-call engineer: watches a codebase, detects broken commits, diagnoses root cause via a code graph + AI, verifies fixes in a sandbox, and ships PRs.

## Stack

| Service | Port | Role |
| ------- | ---- | ---- |
| `sensor` | 3003 | Static code graph (Neo4j), incident detection |
| `responder` | 3004 | AI diagnosis, sandbox verify, policy gate, GitHub PR |
| `neo4j` | 7474 / 7687 | Code graph + runbook vector index |
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

## RocketRide (diagnosis pipeline)

RescueOps++ runs its diagnosis pipeline on **RocketRide Cloud** — not a local engine. The pipeline file is `services/responder/diagnose.pipe`; the SDK client is in `services/responder/src/pipeline.ts`.

**Required keys** (in `.env`):

- `ROCKETRIDE_APIKEY` — from [rocketride.ai](https://rocketride.ai)
- `ROCKETRIDE_URI` — `https://api.rocketride.ai`

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
| Nebius | Runbook embeddings | `NEBIUS_*` |
| Daytona | Sandbox test verification | `DAYTONA_*` |
| GitHub | Fix PRs | `GITHUB_TOKEN`, `GITHUB_REPO` |

## Milestones

Build specs live in `claude-code-prompt-m1` through `m8` at the repo root. M1 = target repo, M2 = code graph, M3 = RocketRide diagnosis, M4 = Daytona verify, M5 = Butterbase backend, M6 = ship PR, M7 = approval gate, M8 = Mission Control UI.

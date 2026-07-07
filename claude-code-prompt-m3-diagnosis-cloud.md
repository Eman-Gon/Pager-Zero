# Claude Code Build Prompt — RescueOps++ M3: RocketRide Cloud Diagnosis Pipeline

> Paste below the line into Claude Code, run from the repo that already has `target-repo` (M1) and
> the `sensor` + Neo4j Compose stack (M2). **This milestone needs real accounts** — RocketRide
> Cloud, Butterbase, Nebius — so Phase 0 verifies connectivity before anything is built. Phased
> build: **STOP at every gate** and wait for my "go" / "next".

---

You are building **Milestone 3** of RescueOps++, an autonomous on-call engineer for a codebase.
Read this entire brief before writing any code. Follow the operating constraints and **STOP at every
gate**.

M2 gave us a sensor that detects a broken commit and a Neo4j code graph that names the root-cause
function and its blast radius (`GET /incident`). **M3 adds the brain: a diagnosis pipeline deployed
to RocketRide Cloud that reasons over the incident — grounded in the real code and in retrieved
runbooks — and returns a structured, cited diagnosis.** M3 is **read-only**: it explains and
proposes an approach; it does not write or run fixes (that's M4).

## 1. Project facts

- Adds a new `services/responder` (the orchestrator) + a RocketRide `.pipe` + a runbook substrate in
  Neo4j. **Reads** `target-repo` and the M2 sensor; does not modify either.
- The reasoning **must run on RocketRide Cloud**, not a local engine — a local pipeline fails the
  mandatory requirement.

## 2. Locked stack additions — do not substitute without asking

- **`services/responder`**: TypeScript + Node 20, ESM, **Fastify `^4.28.1`**, run with **tsx**.
- **`rocketride`** npm SDK — the client that runs the pipeline on Cloud.
- **`neo4j-driver` `^5`** — runbook vector search.
- **Nebius** (OpenAI-compatible) — embeddings for the runbook vector index. Confirm the base URL +
  current embedding model ID in the Nebius dashboard (model IDs change); set the Neo4j vector index
  dimension to match that model.
- **Butterbase AI gateway** (OpenAI-compatible: chat + embeddings + model listing) — serves the
  pipeline's chat LLM. Confirm the gateway base URL + auth in the Butterbase dashboard.

Do **not** add: Daytona, Opsera, Twilio, a UI, persistence beyond Neo4j, or Butterbase auth/payment
(those are later milestones). **STOP and make the case** if you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify** `target-repo`, the `sensor`, or the M2 code-graph logic. M3 only *reads*
  `/incident` and the target source, and *adds* runbook nodes to Neo4j.
- New files only, except adding `neo4j`-adjacent seed steps and the `responder` service to Compose.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** The responder is: read incident → assemble context → (retrieve runbooks) →
   call Cloud pipeline → return diagnosis. The pipeline is a single diagnosis LLM step. Nothing more.
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts

### The RocketRide pipeline (`diagnose.pipe`)

- Built in the RocketRide VS Code extension (or hand-authored JSON), run on **Cloud** via the SDK.
- A **diagnosis LLM step**: takes the assembled incident context as input, returns **JSON**:
  `{ severity: "low"|"medium"|"high", root_cause_explanation: string, proposed_fix_approach: string,
  cited_runbook: string|null }`.
- **LLM routing (primary):** point the pipeline's LLM node at **Butterbase's AI gateway** via its
  OpenAI-compatible base URL + key. **Fallback (only if RocketRide's LLM node won't accept a custom
  base URL — confirmed in Phase 0):** use a RocketRide-native provider for the pipeline, and have the
  `responder` call Butterbase's gateway to generate the `root_cause_explanation`, so the gateway is
  still in active use. Pick the primary if Phase 0 shows it works.

### The `responder` service

- `POST /diagnose`:
  1. `GET {SENSOR_URL}/incident`. If `status:"ok"` → return `{status:"ok"}`.
  2. Read the root-cause function's source and its failing test from `target-repo` (using
     `root_cause` + `changed_functions` from the incident).
  3. *(Phase 2)* Retrieve runbooks via GraphRAG (below) and include them in context.
  4. Assemble context (incident + code + failing test + runbooks) and run `diagnose.pipe` on
     **RocketRide Cloud** via the `rocketride` SDK (`use({filepath})` → `chat()`/`send()` →
     parse JSON with `Answer.parseJson`).
  5. Return the structured diagnosis JSON.
- Connects with `new RocketRideClient({ auth: ROCKETRIDE_APIKEY, uri: ROCKETRIDE_URI })`. **`uri`
  must be the Cloud endpoint** (confirm `api.rocketride.ai` vs `cloud.rocketride.ai` for your
  account). Expose `GET /connection` returning `client.getConnectionInfo()` so we can *prove* it ran
  on Cloud, not localhost.

### Runbook substrate in Neo4j (Phase 2 — the piece deferred from M2)

- Seed ~4 `(:Runbook {title, text, embedding})` nodes, one per bug class (e.g. wrong-operator,
  off-by-one, null-handling, type-mismatch). Link each `(:Runbook)-[:APPLIES_TO]->(:Function)` where
  relevant (e.g. the wrong-operator runbook applies to `computeTax`).
- Create a Neo4j **vector index** on `Runbook.embedding` (dimension = the Nebius model's dimension,
  cosine similarity). Populate embeddings by embedding each runbook's text via **Nebius**.
- **Graph-aware retrieval:** embed an incident query via Nebius, then
  `CALL db.index.vector.queryNodes('runbook_vec', 5, $qEmb) YIELD node, score`, and prefer runbooks
  that `APPLIES_TO` the incident's `root_cause` function (graph + vector, not vector alone).

## 6. Compose

- Add `responder` (`build: ./services/responder`): env `ROCKETRIDE_APIKEY`, `ROCKETRIDE_URI`,
  `BUTTERBASE_GATEWAY_URL`, `BUTTERBASE_API_KEY`, `NEBIUS_BASE_URL`, `NEBIUS_API_KEY`,
  `NEBIUS_EMBED_MODEL`, `NEO4J_URL/USER/PASSWORD`, `SENSOR_URL=http://sensor:3003`,
  `TARGET_DIR=/target`, `PORT=3004`; mounts `./target-repo:/target`; `depends_on` `neo4j` (healthy)
  and `sensor`; publishes `3004:3004`. Dockerfile mirrors the sensor's (`node:20-alpine`, `apk add
  git` if needed, `npm install`, `CMD ["npm","start"]`).

## Phases — STOP at each gate

**Phase 0 — connectivity smoke (do this before building anything).** A throwaway script proves each
external dep works with your creds:
- RocketRide: connect to the **Cloud** URI + API key, run a trivial `.pipe`, confirm
  `getConnectionInfo().uri` is the cloud host (not localhost).
- Butterbase gateway: one OpenAI-compatible chat call returns a completion; **and determine whether
  RocketRide's LLM node accepts this base URL** (decides primary vs. fallback in §5).
- Nebius: one embeddings call returns a vector; record its dimension.
→ **verify:** all three return success; you've recorded the cloud URI, the gateway base URL, the
Nebius model + dimension, and the primary/fallback LLM decision. **STOP.**

**Phase 1 — Cloud diagnosis (no runbooks yet).** Build `diagnose.pipe` (diagnosis LLM step, JSON
out, LLM via Butterbase gateway per Phase 0) and the `responder` `POST /diagnose` doing steps 1, 2,
4, 5. Run the pipeline on Cloud.
→ **verify:** with the seeded incident live (`./scripts/break.sh`), `curl -XPOST :3004/diagnose`
returns a diagnosis that names **`computeTax`**, explains the **wrong-operator** bug, and proposes
the corrective approach — grounded in the real function source, not guessed. `GET :3004/connection`
shows the **cloud** URI (proof it ran on RocketRide Cloud). `./scripts/reset.sh` → `/diagnose`
returns `{status:"ok"}`. **STOP.**

**Phase 2 — runbook GraphRAG.** Add the runbook substrate, vector index, Nebius embeddings, and the
graph-aware retrieval; feed retrieved runbooks into the pipeline context.
→ **verify:** for the incident, the retrieval returns the **wrong-operator** runbook (vector match,
boosted by its `APPLIES_TO computeTax` link), and the diagnosis's `cited_runbook` names it. Swap in a
different seeded incident (if available) and confirm a different runbook surfaces. **STOP.**

## Out of scope — do NOT build (later milestones)

- Fix **generation** and Daytona sandbox **verification** → M4.
- Applying the fix / GitHub PR / Opsera pipeline + MTTR → M6.
- Butterbase **auth, payment (credits), and persistence** → M5.
- Human approval gate → M7. Any UI → M8.
- Autonomous tool-calling by the agent (fetching code / running commands itself) — M3 reasons over
  context the responder assembles; agent autonomy arrives with Daytona in M4.

## Definition of done

`diagnose.pipe` runs on **RocketRide Cloud** (proven via the connection URI); `POST /diagnose`
returns a correct, structured, **grounded** diagnosis for the seeded incident, with the chat LLM
served through **Butterbase's AI gateway** and the cited runbook retrieved via a **Neo4j vector
index** populated by **Nebius** embeddings. Then **STOP and report**: the branch, the passing checks,
the confirmed cloud URI + gateway base URL + Nebius model, and one line noting that M4 (Daytona
verify-loop — generate a candidate fix and prove it against the real test suite in a sandbox) is next.

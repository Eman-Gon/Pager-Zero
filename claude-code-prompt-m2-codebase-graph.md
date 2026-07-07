# Claude Code Build Prompt — RescueOps++ M2: Sensor + Neo4j Code Graph

> Paste below the line into Claude Code, run from the folder that already contains **`target-repo`**
> from M1. Neo4j runs locally in Compose; no external keys. Phased build: **STOP at every gate** and
> wait for my "go" / "next".

---

You are building **Milestone 2** of RescueOps++. Read this entire brief before writing any code.
Follow the operating constraints and **STOP at every gate**.

M1 gave us the patient: a real repo whose tests break when a bad commit lands. **M2 adds eyes and a
brain-stem** — a sensor that detects the breakage from the real test suite, and a Neo4j graph of the
**code's own structure** (functions, calls, tests) that turns "several tests are red" into "the real
root cause is function X, and here's its blast radius."

**Why the graph is load-bearing:** when the bug in `computeTax` lands, the tests for `computeTax`,
`invoiceTotal`, and `renderInvoice` all go red — because the callers depend on it. A flat list of red
tests can't tell the culprit from the collateral. The **call graph** can: the root is the *changed*
function that is red and that doesn't itself call another changed function; everything that
(transitively) calls it is the blast radius. That traversal is M2's entire point.

## 1. Project facts

- Builds the RescueOps++ system at the repo root (a new `services/sensor` + a `docker-compose.yml`).
- **Reads** `./target-repo`; never modifies it.
- Local-first. Neo4j runs in Compose.

## 2. Locked stack additions — do not substitute without asking

- **Neo4j 5** (`neo4j:5`) in Docker Compose. Bolt `7687`, HTTP `7474`.
- **`sensor`** service: TypeScript + Node 20, ESM, **Fastify `^4.28.1`**, run with **tsx**.
- **`ts-morph` `^24`** for static analysis (build the call graph).
- **`neo4j-driver` `^5`** for Cypher.
- Sensor runs the target's tests with **vitest's JSON reporter** and parses the result.
- Sensor image needs **git** (`apk add git`) to read HEAD and diffs.

Do **not** add: a message bus, an ORM, GraphQL, any other sponsor SDK (RocketRide/Nebius/Daytona/
Butterbase/Opsera), or a UI. **STOP and make the case** if you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify anything in `target-repo`.** M2 only reads its source, git state, and test output.
- New files only, except creating the root `docker-compose.yml`.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** Minimum code. The sensor is: build-graph-once + poll-and-test + one endpoint.
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts

### Neo4j schema (built by the sensor from `target-repo` source via ts-morph)

- `(:Function {name, file, changed, status})` — one per exported function. `status` ∈
  `"passing" | "failing" | "unknown"`; `changed` boolean.
- `(:Test {name, file, status})` — one per test **file** (file-level is fine). `status` ∈
  `"passing" | "failing" | "unknown"`.
- `(:Function)-[:CALLS]->(:Function)` — resolved via ts-morph's type checker (a call expression
  whose symbol resolves to another project function). Direct calls only.
- `(:Test)-[:TESTS]->(:Function)` — a test file TESTS each function it imports from `src`.

Build the graph **once on startup** from the tag-`good` source (idempotent `MERGE`). It's the static
structure; the sensor only updates `status`/`changed` afterward.

### Sensor behavior

- Connect to `bolt://neo4j:7687` (env creds), **retry** the initial connect (~20s Neo4j startup).
- On startup: build the code graph (above), then run one baseline scan.
- **Poll loop (~2s):** read `target-repo` HEAD (`git rev-parse HEAD`). On first run or when HEAD
  changed:
  1. run the target's tests (`npx vitest run --reporter=json` in `target-repo`), parse per-file
     pass/fail → set each `(:Test).status`; a `(:Function)` is `"failing"` if any test that TESTS it
     failed, else `"passing"`.
  2. compute changed functions: `git -C target-repo diff --name-only good..HEAD` → for changed
     source files, mark their `(:Function)`s `changed=true` (reset others to `false`).
  3. log one structured line per status **transition** only (e.g. `{"event":"status_change",
     "function":"computeTax","to":"failing"}`).

### Root-cause traversal (exact Cypher) + blast radius

Root cause:
```cypher
MATCH (f:Function {changed:true, status:'failing'})
WHERE NOT EXISTS { MATCH (f)-[:CALLS]->(:Function {changed:true}) }
RETURN f.name AS root_cause
```
Blast radius (everything that transitively calls the root):
```cypher
MATCH (caller:Function)-[:CALLS*]->(root:Function {name:$root})
RETURN DISTINCT caller.name AS affected
```

### Sensor endpoint

- `GET /incident`:
  - incident present: `200 {status:"incident", failing_tests:[...], changed_functions:[...],
    root_cause:"<name>", blast_radius:[...]}`
  - all green: `200 {status:"ok", failing_tests:[], changed_functions:[], root_cause:null, blast_radius:[]}`

## 6. Compose

- `neo4j` (`neo4j:5`, `NEO4J_AUTH: neo4j/devpassword`, ports `7474`/`7687`, healthcheck e.g.
  `["CMD-SHELL","wget -qO- http://localhost:7474 || exit 1"]`).
- `sensor` (`build: ./services/sensor`): mounts `./target-repo:/target` (read path), env
  `NEO4J_URL/NEO4J_USER/NEO4J_PASSWORD`, `TARGET_DIR=/target`, `PORT=3003`; `depends_on: neo4j:
  {condition: service_healthy}`; publishes `3003:3003`. Dockerfile: `node:20-alpine`, `apk add git`,
  `npm install`, `CMD ["npm","start"]`.

## Phases — STOP at each gate

**Phase 0 — Neo4j + graph builder.** Compose with `neo4j` + `sensor`; sensor connects (with retry)
and builds the code graph from `target-repo` (no test-running yet).
→ **verify:** `docker compose up --build`; in Neo4j (`:7474` or cypher-shell) the graph shows the
`(:Function)` nodes, the `invoiceTotal-[:CALLS]->computeTax` edge, and `(:Test)-[:TESTS]->` edges.
**STOP.**

**Phase 1 — test-driven status.** Add the poll loop, test run + parse, status writes, changed-function
diff, transition logs.
→ **verify:** at `good` state every `(:Test)`/`(:Function)` is `passing`. Run `./scripts/break.sh`
(commits the bad tax change) → within a couple cycles the sensor logs transitions and Neo4j shows
`computeTax` (and its callers' tests) `failing` with `computeTax.changed=true`. `./scripts/reset.sh`
→ back to all `passing`, `changed=false`. **STOP.**

**Phase 2 — root cause + blast radius.** Add the traversal + `GET /incident`.
→ **verify:** with the incident applied, `curl :3003/incident` returns `root_cause:"computeTax"` and
`blast_radius` containing `invoiceTotal` and `renderInvoice` — **derived from tests + git diff + the
call graph, not told which function broke.** `./scripts/reset.sh` → `/incident` returns `status:"ok"`
with `root_cause:null`. **STOP.**

## Out of scope — do NOT build (later milestones)

- Runbook nodes + Neo4j vector index → **M3** (populated by Nebius embeddings there).
- The RocketRide agent crew, Nebius, **Daytona** (M4 moves fix-verification into a sandbox — M2 runs
  tests locally in the sensor on purpose), Butterbase, Opsera, Twilio, any UI.
- Any edit to `target-repo` (see §3).

## Definition of done

`docker compose up --build` runs Neo4j + sensor; the sensor builds a real code graph from
`target-repo` and tracks real test status; under the seeded incident `GET /incident` returns the
correct `root_cause` and `blast_radius`, and clears on reset. Then **STOP and report**: the branch,
the passing checks, and one line noting that M3 (a **RocketRide Cloud** diagnosis pipeline — chat
LLM via **Butterbase's AI gateway**, runbook-GraphRAG embeddings via **Nebius** — reading
`/incident`) is next.

# RescueOps++ Readiness Audit

Phase 0 — static sweep. Date: 2026-07-07. Method: full source read of all four packages by
parallel auditors + independent verification of every Blocker/Major claim (file:line cited),
typecheck of every package, live-bundle inspection of the deployed frontend.

## Inventory vs intended architecture

| Component | Location | Status |
| --- | --- | --- |
| Patient repo (M1) | `target-repo/` | Real: own git repo, tag `good` == HEAD, 4 test files / 7 tests, all green |
| Alt patient | `patients/claimflow/` | Real code (5 suites / 16 tests green) but **unwired + broken scripts** (see B4/M-13) |
| Sensor (M2) | `services/sensor/` | Real: ts-morph graph → Neo4j writes, vitest JSON runs, Cypher root-cause |
| Responder (M3–M7) | `services/responder/` | Real: RocketRide Cloud, Daytona, Butterbase, GitHub, policy gate |
| Diagnosis pipes | `services/responder/*.pipe` | `rescueops-diagnose-query.pipe` primary, `diagnose.pipe` fallback |
| Frontend (M8) | `frontend/` | Real panels over real endpoints; deployed at composio-expense-approval.butterbase.dev |
| Ops scripts | `scripts/` | dev-native (canonical), preflight, e2e, e2e-negative, break/reset |
| Docker | `docker-compose.yml` | **Secondary + stale** vs native flow (M-8) |
| `services/gateway`, `services/orders`, `services/payments` | — | Dead scaffolding: `node_modules/` only, zero source, referenced nowhere (m-16) |
| `services/rocketride` | Dockerfile for the local engine image (compose-only) | OK |
| `services/memory` | Real Python/Cognee service, profile-gated in compose | OK |

Typecheck: sensor ✅ responder ✅ frontend ✅ (tsc --noEmit clean). Patient suites: target-repo 7/7 ✅, claimflow 16/16 ✅.
Lint: **no package has a lint script configured** (m-19).

## Wiring verification (each milestone link proven real, not stubbed)

| Link | Evidence |
| --- | --- |
| sensor → Neo4j writes | `services/sensor/src/codegraph.ts:64-102` MERGE Function/Test + CALLS/TESTS; `scan.ts:69-111` status/changed writes via `executeWrite` |
| root cause = Cypher, not JS | `services/sensor/src/index.ts:59-63` leaf-most changed+failing query; blast radius `index.ts:69-70` `CALLS*` traversal |
| /incident = real vitest state | `services/sensor/src/scan.ts:36-62` spawns `npx vitest run --reporter=json`, throws on missing/empty results — no synthesized results |
| responder → RocketRide **Cloud** | `services/responder/src/pipeline.ts:237-238` env-driven URI (`https://api.rocketride.ai`), real `client.connect()`/`chat` at `:266,:401`; `preflight.sh` fails if /connection reports localhost |
| GraphRAG → Neo4j vector search | `services/responder/src/runbooks.ts:125-131` `db.index.vector.queryNodes` + `APPLIES_TO` boost; live Nebius embeddings `:53-64`; returns null (never fabricates) when unconfigured `:121` |
| /remediate → Daytona | `services/responder/src/verify.ts:85,73-74,188-216` real sandbox create/upload/exec; throws if `DAYTONA_API_KEY` unset (`:26`) — no fake-verify path |
| /apply → spendCredit → GitHub PR (+refund) | `services/responder/src/index.ts:265` spend → `:272` openFixPr → `:279` refundCredit on throw; Opsera gate before spend `:256-263` |
| approval gate → /apply | `index.ts:323` evaluatePolicy → park `:328-336` (dedups via findPendingApproval); `/approvals/:id` `:359-417`; double-ship guards `:250,:392`, `butterbase.ts:360` |
| UI → real endpoints | every panel backed by a live call (graph: bolt loadGraph + /incident fallback; trace /diagnose; sandbox /remediate; approvals Data API + POST /approvals/:id; credits /account; ship /apply; StatusBar /health). No sample data found |
| **Policy is deterministic code** | ✅ CONFIRMED. `services/responder/src/policy.ts:27-41` pure string/number comparisons over `policy.json`; `opsera.ts:63-74` allowlist regex. No LLM import in either |
| mock-nebius | ✅ dev-only; nothing in services/ or .env.example points at it; default is the real `api.tokenfactory.nebius.com` |

---

## BLOCKERS

**B1 — Demo-rigged fix synthesis (faked path).** `services/responder/src/butterbase.ts:262-286`
`materializeCandidate` falls back to hardcoded `root_cause==='computeTax' → 'src/tax.ts'` (`:268`) and a
literal `content.replace('amount + rate', 'amount * rate')` (`:278`) gated only on `/multiplic/i` in the
stored fix approach. Reachable on the `/remediate` cached path whenever a stored diagnose action has empty
`candidate_fix` content (`packCandidateFix` stores `{path:'',content:''}` when the LLM returned none,
`butterbase.ts:87-97`). This synthesizes the demo answer without the LLM — the exact thing this project
claims not to do. **Fix:** delete the computeTax mapping + string-replace; return null so /remediate
re-runs the real pipeline.

**B2 — Shipped default disables the paywall and breaks both e2e proofs.** `.env.example:71`
`UNLIMITED_CREDITS=1`. Under it `spendCredit` never decrements or paywalls (`butterbase.ts:198,456-461`)
and `refundCredit` no-ops (`:485`). `e2e.sh:134` (strict −1 decrement) and `e2e-negative.sh:149,157`
(paywall 402) can never pass from a fresh `.env.example` copy; the negative script toggles only
`DEMO_AUTO_CREDITS`. The working `.env` on this machine has `0`, so the drift is invisible locally.
**Fix:** default `UNLIMITED_CREDITS=0` in `.env.example`.

**B3 — `.env.example` cannot boot the system.** Missing entirely: `NEO4J_URI/URL`, `NEO4J_USERNAME/USER`,
`NEO4J_PASSWORD`, `NEO4J_DATABASE` (dev-native.sh:80 exits 1 without them), `GITHUB_TOKEN`, `GITHUB_REPO`,
`BUTTERBASE_APP_ID`, `BUTTERBASE_API_URL` — all hard-checked by `preflight.sh`, which therefore FAILs on a
fresh copy. **Fix:** add the missing block (empty values) to `.env.example`.

---

## MAJOR

**M-1 — Aura DB password baked into local build output (latent leak on next deploy).**
`frontend/src/panels/GraphPanel.tsx:8-10` reads `VITE_NEO4J_*` at build time; `frontend/.env.local` holds
the real Aura password, and `frontend/dist/assets/index-C1VGfmq-.js` (local, untracked) contains it.
**Verified: the LIVE deployed bundle does NOT contain the Aura creds** — but any redeploy built from this
machine will publish full read/write DB access. Architectural cause: browser-side bolt. **Fix (demo-safe):
build deploys with `VITE_NEO4J_*` unset (graph falls back to the /incident subgraph); long-term: proxy
graph reads through the responder.**

**M-2 — Working demo credential shipped in git and in the LIVE bundle.** `Resc!ue0ps2026` for
`oncall@rescueops.dev` appears in `.env.example:101`, `frontend/.env.example:10`, hardcoded in
`scripts/dev-native.sh:125`, as a source default in `services/responder/src/autonomous.ts:14`, and is
**present in the live deployed JS** (verified). Anyone can log into the app as the demo user. Accepted
risk for a hackathon demo account, but: **Fix:** treat as throwaway; rotate after the event; remove the
source-code default (fail fast when `AUTONOMOUS=1` and unset).

**M-3 — Synthetic credit states on write failure (silent fake).** `butterbase.ts:213-216` fabricates
`apply_credits: PLAN_CREDITS` in the returned account when the grant write fails; `:466-472` returns a
decremented `remaining` even if the spend write fails (`persisted` only logged). Post accounts.id fix these
paths are rarely hit, but when hit the UI shows balances the DB doesn't have. **Fix:** surface persist
failure (flag or true balance) instead of the optimistic value.

**M-4 — `/incident` reports "ok" before any scan has run.** `services/sensor/src/index.ts:39-86` reads
only graph state; nodes start `status:'unknown'` (`codegraph.ts:71,79`), so pre-first-scan the endpoint
returns `ok` though no test ever ran. Also scan-loop errors (`index.ts:103-105`) never surface, so a
persistently failing scan serves stale state indefinitely. **Fix:** include last-scan timestamp/HEAD (and
last error) in the payload.

**M-5 — Multi-candidate root cause is non-deterministic.** `index.ts:59-64` takes `records[0]` of an
unordered query; `changed` is file-granular (`scan.ts:31-34,99-105`), so a multi-file bad commit can flip
which "root cause" is reported per run. Known limitation, now confirmed at file:line. **Fix:** ORDER BY +
return all candidates (flag — design change, don't quick-fix).

**M-6 — Static deploy silently loses every backend call.** `frontend/src/api.ts:5-6` defaults
`VITE_SENSOR_URL`/`VITE_RESPONDER_URL` to `/sensor`,`/responder` (Vite dev-proxy only,
`vite.config.ts:22-31`); on the static deploy every call 404s and the UI degrades to "offline" with no
hint. Both vars are also missing from `frontend/.env.example`. **Fix:** document the vars; consider a
visible banner when health checks 404 on a non-dev host.

**M-7 — claimflow patient is broken and orphaned.** `patients/claimflow` is NOT its own git repo (tracked
by the root repo); `scripts/break-claimflow.sh` would commit the planted bug INTO THE ROOT REPO history,
and `scripts/reset-claimflow.sh:5` targets a `good` tag that doesn't exist there → fails every run.
Nothing references claimflow (docs, compose, sensor). **Fix:** either `git init` + tag it and document, or
delete the pair (flag — user decision).

**M-8 — docker-compose diverges from the canonical native flow.** `docker-compose.yml` defaults
`ROCKETRIDE_URI=ws://rocketride:5565` (local engine) which directly fails preflight's cloud assertion, and
its responder env lacks `UNLIMITED_CREDITS`, `MAX_CANDIDATES`, `OPSERA_*`, `AUTONOMOUS*`,
`SERVICE_EMAIL/PASSWORD`. README:33 still advertises `docker compose up --build` first. **Fix:** mark
compose as the offline/local path in README (or bring env to parity) — flag, don't silently rewrite.

---

## MINOR

- m-1 `services/sensor/src/scan.ts:57-58` — skipped/todo/pending vitest statuses collapse to `failing` → possible false incident. Fix: only `'failed'` maps to failing.
- m-2 `services/sensor/src/neo4j-config.ts:7` and `services/responder/src/neo4j-config.ts:7` — hardcoded `'devpassword'` fallback. Fix: fail fast when unset.
- m-3 `services/sensor/src/scan.ts:32` — baseline ref `good` hardcoded. Fix: env var with `good` default.
- m-4 `services/responder/src/pipeline.ts:375` — legacy-pipe fallback swallows the query-pipe load error. Fix: log before falling through.
- m-5 `services/responder/.accounts-probe.mjs` — committed diagnostic that writes to `accounts` (restores itself). Referenced by e2e.sh's failure hint; keep or move under scripts/, but note it's a mutating dev tool.
- m-6 `frontend/src/components/ActionProgress.tsx:31-37` — pipeline "progress" steps auto-advance on a fixed 2800 ms timer; cosmetic, decoupled from real backend progress (final result IS backend-gated). Fix: label indeterminate or drive from real events.
- m-7 `frontend/src/panels/TracePanel.tsx:46`, `SandboxPanel.tsx:64`, `App.tsx:232`, `auth.ts:13,45,54`, `GraphPanel.tsx:70` — silent `.catch(()=>{})` on restore paths; failures invisible. Fix: one console.warn each.
- m-8 `frontend/package.json:14` — `react-force-graph-2d` never imported (graph uses NVL). Fix: remove.
- m-9 `frontend/src/panels/SandboxPanel.tsx:18,84` — `selected` field set, never rendered. Fix: remove.
- m-10 `frontend/dist/index.html` tracked in git and stale (loads Chakra+Petch; source uses Geist). Fix: `git rm --cached`, ignore dist/ fully.
- m-11 `frontend/tsconfig.tsbuildinfo`, `services/memory/__pycache__/app.cpython-312.pyc` tracked. Fix: untrack + gitignore.
- m-12 `scripts/phase0-smoke/package-lock.json`, `scripts/phase0-daytona/package-lock.json` tracked though each dir's `.gitignore` lists them. Fix: pick one intent.
- m-13 `scripts/break-claimflow.sh`, `scripts/reset-claimflow.sh` unreferenced by README/DEMO (see M-7).
- m-14 `scripts/e2e-negative.sh:110-129` — `.env` mutated (perl -i) before the `trap restore_env EXIT` is installed; a crash in that window leaves `DEMO_AUTO_CREDITS=0`. Fix: set trap first.
- m-15 `scripts/dev-native.sh:44-50` — port sweep kills ANY listener on 3003/3004/5173, including unrelated processes. Acceptable; note it.
- m-16 `services/gateway/`, `services/orders/`, `services/payments/` — node_modules-only dead scaffolding, referenced nowhere. Fix: delete directories.
- m-17 `frontend/src/api.ts:3` — `app_gsuwgmmbc74g` app id defaulted in code (public-ish identifier). Fix: env-only.
- m-18 `.env.example` also missing (used with code defaults): `SENSOR_URL`, `RESPONDER_URL`, `FRONTEND_URL`, `PATIENT_REPO`, `BUTTERBASE_PLAN_CREDITS`, `NEO4J_MCP_ENDPOINT`, `SENSOR/RESPONDER PORT`, `COGNEE_EPISODE_DATASET`, `MEMORY_TIMEOUT_MS`. Fix: document.
- m-19 no lint script in any package (tsc-only hygiene). Fix: optional eslint config — out of demo scope.

## Clean (checked, no finding)

- No TODO/FIXME/HACK/mock/stub/placeholder markers in any real code path (only the intentional `/apply-stub` probe endpoint).
- No secrets in tracked files beyond M-2 (scanned for bb_sk_/sk-/ghp_/github_pat_/AKIA); `.env` never committed (history checked); `.gitignore` covers `.env`, `frontend/.env.local`, `.dev/`.
- No fabricated diagnosis on LLM failure: `pipeline.ts:439-468` falls back to another REAL RocketRide pipe; `diagnosis-validate.ts:27,35` throws rather than invents.
- e2e.sh / e2e-negative.sh assert real outcomes (real PR URL, real 402s, verified:false); no `|| true` on assertion lines.
- All scripts space-in-path safe (repo path contains a space; `printf '%q'` used where scripts are generated).
- No debug/console noise in sensor, responder, or frontend src.
- Structured JSON logging only (`log.ts`).

---

## Live Integration (Phase 1, 2026-07-07 evening)

**Environment caveat:** the stack was actively reconfigured by a parallel session DURING this phase —
the patient was switched from `target-repo` to `patients/claimflow` (now its own git repo with a `good`
tag) and `GITHUB_REPO` moved to `Eman-Gon/pager-zero-demo`. Items below marked ⚠ were affected.

| Leg | Result | Evidence (observed live) |
| --- | --- | --- |
| RocketRide = cloud, not localhost | **PASS** | `GET :3004/connection` → `{"connected":true,"transport":"WebSocket","uri":"wss://api.rocketride.ai/task/service"}` |
| Neo4j root cause = real Cypher over real state | **PASS** | During a live incident, direct Cypher on Aura (leaf-most changed+failing query) returned `computeTax`, blast `['invoiceTotal','renderInvoice']`, test statuses `format/tax/total=failing, discount=passing` — byte-identical to `/incident`. After the patient switch, the graph re-scanned to claimflow's functions (`scan_done head=436d674f`), proving state tracks the real repo |
| Butterbase auth issues real tokens | **PASS** | `signIn` → RS256 JWT, `iss=butterbase:app:app_gsuwgmmbc74g`, `sub=f244782a…`, 1 h expiry |
| RLS on persisted rows | **PASS** | User JWT: 5 incident rows, ALL `user_id == sub`. Anonymous (no token): `[]` on all four tables, anon INSERT → 403. Hardening note: app `access_mode=public`, so anon gets 200 `[]` rather than 401 at the edge |
| Incidents/actions persist | **PASS** | 26 remediate actions + incidents queried directly via Data API; today's e2e persisted incident→resolved with `mttr_seconds` |
| Credits real + strict decrement | **PASS** | Today's e2e step 6: `credits: 5 -> 4` asserted strictly AND confirmed in Postgres (`accounts.apply_credits=4` via Data API); PR #4, MTTR 23 s |
| Paywall blocks at zero | **PASS (morning run)** ⚠ | `e2e-negative.sh` proof D green this morning (402 `payment_required`, no PR). Not re-run tonight: the mid-migration config would produce noise, not signal |
| Subscription grants credits (Stripe) | **NOT PROVEN** | `GET /v1/{app}/billing/plans` → `{"plans":[]}` — **no Stripe plan is configured on the app**; `subscription: null`. The `ensureAccount` grant path is untestable until a plan exists → HUMANS.md |
| LLM traffic through Butterbase gateway | **PARTIAL** | Live chat completion via `api.butterbase.ai/v1` with the app key succeeded (`"pong"`, `total_tokens: 20` billed in-response) — traffic is real. But `GET /v1/{app}/ai/usage` stayed `{"totalTokens":0}` (that endpoint meters a different feature); dashboard usage view not verifiable from this session |
| Daytona = real sandbox, real suite | **PASS** | Sandbox `8eac6473-…` created, ran the patient's actual vitest suite (16 tests), deleted. Morning e2e: cold verify with real `npm test` output |
| Daytona **can reject** a bad fix | **PASS this morning / FAIL tonight** ⚠ | Morning `e2e-negative.sh` all-4-green incl. `verified:false` for the bad candidate. Tonight proof A returned `verified:true` — root-caused (action `f6e2e6a3`): the stack had been switched to claimflow mid-run, so the bad `src/tax.ts` landed as an ORPHAN file no claimflow test imports; suite green → verified:true. Not a verify-code regression, but it exposed L2 below |
| Deny → aborts, no side effects | **PASS (morning run)** ⚠ | Proof B green this morning (denied → no PR, no credit). Not re-run tonight (same reason as proof D) |
| `/incident` reflects real test state | **PASS** | Flipped incident→ok live across break/reset and the patient switch |

### New findings from Phase 1

**L1 (Blocker, transitional) — demo config is mid-migration and internally inconsistent.** The running
stack targets `patients/claimflow` + `GITHUB_REPO=Eman-Gon/pager-zero-demo`, but `scripts/break.sh`,
`scripts/reset.sh`, `e2e.sh` (asserts `computeTax`/`src/tax.ts`), `e2e-negative.sh`, and `DEMO.md` all
still hardcode the `target-repo` patient. In this state the verification suite cannot pass and the demo
runbook is wrong. Uncommitted working-tree changes (README, docker-compose, api.ts, runbooks.ts,
ApprovalPanel) suggest the migration is in flight. **Fix: finish or revert the patient switch, then re-run
both e2e scripts end-to-end before demo day.**

**L2 (Major) — verify can pass a fix that touches nothing the tests cover.** `verify.ts` uploads
`candidate.path` unconditionally; a path that doesn't exist in the patient becomes an orphan file, the
untouched suite passes, and the candidate is `verified:true` (proven live tonight by action `f6e2e6a3`:
bad `src/tax.ts` content + claimflow's 16-green output). **Fix idea (flag, design-level): fail verify when
`candidate.path` doesn't already exist in the repo — a one-line existence check before upload.**

## Notes / corrections to raw findings

- The frontend auditor's claim that the Aura password is in the shipped bundle is true only for the LOCAL
  `dist/` build; I downloaded the live deployed bundle and confirmed it contains the demo login + app id
  but NOT the Aura creds (M-1/M-2 severities set accordingly).
- The React 19 / @neo4j-nvl peer-dependency risk noted in project history no longer exists: installed
  `@neo4j-nvl/react` peers `react 18.0.0 || ^19.0.0` — React 19.2.7 satisfies it, no overrides needed.
- `SERVICE_PASSWORD` is NOT in DEMO.md (only the email is); the exposure is `.env.example` + dev-native.sh + autonomous.ts + the live bundle.
- M-7 is now PARTIALLY STALE: during Phase 1 a parallel session made `patients/claimflow` its own git
  repo with a `good` tag (commit `436d674`), so `reset-claimflow.sh` can work. The remaining M-7/L1 issue
  is script/docs coherence: the main break/reset/e2e scripts and DEMO.md still assume `target-repo`.

# RescueOps++ — Demo Runbook

The exact on-stage sequence: what to run, what to say, and what each Mission
Control panel shows at every beat. Verified end-to-end by `scripts/e2e.sh`
(happy path) and `scripts/e2e-negative.sh` (the four "it can say no" proofs).

## 0. Pre-demo checklist (10 minutes before)

```bash
./scripts/dev-native.sh            # sensor :3003, responder :3004, UI :5173
./scripts/preflight.sh             # must print: PREFLIGHT: all PASS
./scripts/reset.sh                 # target repo green
```

- Open **http://127.0.0.1:5173** (auto-signs-in as `oncall@rescueops.dev`).
- The responder **warms the RocketRide Cloud pipeline at boot** — give it ~2
  minutes after start before the first diagnose so the first click is fast.
- Keep a terminal visible for `break.sh` / `reset.sh` — the audience should
  see the incident is a *real bad commit*, not a staged flag.
- Backup slide URL (UI shell only, no live backends):
  https://composio-expense-approval.butterbase.dev

## 1. The beats

### Beat 1 — "This codebase is healthy" (30s)

Show Mission Control: the **code graph** panel renders the real Neo4j call
graph of `target-repo` (built by static analysis, ts-morph); all nodes green.
StatusBar shows sensor/neo4j/RocketRide/Daytona/GitHub all up.

> "RescueOps++ is an autonomous on-call engineer. This is the codebase it's
> watching — a real repo with a real test suite."

### Beat 2 — Break it (1 min)

```bash
./scripts/break.sh     # commits a wrong-operator bug into computeTax
```

Within ~5 seconds the sensor's poll loop sees the new commit, runs the real
vitest suite, and `GET /incident` flips. On screen: the **graph lights up** —
`computeTax` as root cause, `invoiceTotal` and `renderInvoice` as blast radius.

> "Three tests just went red. A flat list of red tests can't tell culprit
> from collateral — the call graph can: the root cause is the *changed*
> function that's failing; everything that transitively calls it is blast
> radius. That's a graph traversal, not an LLM guess."

### Beat 3 — Diagnose (1–2 min)

Click **Diagnose**. The **agent trace** panel fills with the structured
diagnosis from the pipeline running on **RocketRide Cloud** (prove it:
`curl :3004/connection` → `wss://api.rocketride.ai/...`).

What to point at:
- `severity: high`, the root-cause explanation quoting the actual broken line
- **`cited_runbook: "Wrong operator in arithmetic computation"`** — retrieved
  by Neo4j **vector search over Nebius embeddings**, boosted because that
  runbook `APPLIES_TO computeTax` in the graph (GraphRAG, not vector-only).

### Beat 4 — Prove the fix, don't claim it (2–3 min)

Click **Remediate**. The **sandbox** panel shows the Daytona run: repo
uploaded to a fresh Linux sandbox, `npm install`, candidate fix applied,
real `vitest run` → **verified: true**.

> "The agent doesn't say 'trust me'. The fix is proven against the real test
> suite in an isolated Daytona sandbox before anything ships."

**The anti-rubber-stamp proof** (say it, or show `e2e-negative.sh` output): a
deliberately-bad candidate through the same loop comes back `verified:false`.
If the loop can't say no, it isn't real.

### Beat 5 — Policy gate + human approval (1 min)

Click **Apply**. The fix is severity-high, so the **deterministic policy**
(`policy.json` — evaluated by code, never an LLM) parks it as a pending
approval: no PR, no credit spent. The **Approval** panel shows the button.

> "Risky fixes wait for a human. The risk decision is pure code — severity,
> blast-radius size, protected paths."

Click **Approve**.

### Beat 6 — Ship (1 min)

The ship path runs: credit spend → branch + commit + **real GitHub PR** →
incident marked resolved with **MTTR** computed. The **Ship** panel shows the
PR link and MTTR; the **Credits** panel reflects the spend.

Open the PR on GitHub — the diff is the corrected `computeTax`.
(Example from verification: https://github.com/Eman-Gon/RescueOpsHackWithBay/pull/2)

### Beat 7 — Reset (30s)

```bash
./scripts/reset.sh
```

The sensor re-runs the tests, everything transitions back to green, the board
clears. Ready for the next run.

## 2. Reset between runs

```bash
./scripts/reset.sh                 # restores target-repo to the good tag
```

The Butterbase incident row was resolved by the ship, so the next `break.sh`
opens a fresh incident. If a rehearsal was aborted mid-flow (incident left
open), just run the full flow again — the responder reuses the open incident
for the same root cause and resolves it on ship.

## 3. The "it can say no" beats (optional, judges love these)

All four are automated in `./scripts/e2e-negative.sh`:

| Proof | What happens |
| --- | --- |
| **Reject** | A knowingly-bad candidate → sandbox says `verified:false`, no PR |
| **Deny** | Risky fix → approval **denied** → aborts: no PR, no credit spent |
| **Policy rules** | Severity gate proven through the live `/apply` path (see Deny); protected-path + blast-radius gating and the safe-fix auto path proven against the actual policy module (deterministic code, no LLM) |
| **Paywall** | 0-credit user → `402 payment_required`, no PR |

## 4. Fallbacks if a live service hiccups

| Service | Symptom | One-line fallback |
| --- | --- | --- |
| RocketRide Cloud | Diagnose slow/fails once | Click Diagnose again — the responder retries a flaky answer and auto-recovers wedged cloud tasks; worst case `./scripts/dev-native.sh` (restart re-warms the pipeline) |
| Daytona | Remediate takes long | Narrate the sandbox panel; a verify is 2–3 min cold. If it errors, click Remediate again (fresh sandbox) |
| Butterbase | Sign-in/persistence errors | The engine still diagnoses and verifies; narrate persistence from the e2e logs instead of the panels |
| GitHub | PR fails | `./scripts/preflight.sh` names the failing check; the PAT needs Contents + Pull-requests write |
| Neo4j Aura | Graph panel empty | The incident subgraph fallback renders from `GET /incident`; the traversal still works (it's server-side) |
| Frontend | Panel won't refresh | `curl -X POST :3004/diagnose` etc. from the terminal — every panel is a thin view over these endpoints |

## 5. Known demo caveats (be honest if asked)

- **Credits are synthetic on this Butterbase app**: the app blocks writes to
  the `accounts` table (HTTP 404, server-side), so demo credits are granted
  and spent in-memory per request — the spend is logged and enforced (the
  paywall proof passes) but the displayed balance doesn't decrement across
  requests. Fix belongs in the app's RLS policy for `accounts`.
- **MTTR** is real wall-clock from incident open to PR — during rehearsals it
  can look large because the incident sat open while you talked.
- The RocketRide **agent-tools pipeline** (`rescueops-diagnose-agent.pipe`)
  needs a Neo4j MCP endpoint (`:8787`) that this machine doesn't run — the
  demo uses the query pipeline (`RESCUEOPS_AGENT_PIPELINE=0` in `.env`).

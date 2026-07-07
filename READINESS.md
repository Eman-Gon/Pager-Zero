# READINESS.md — RescueOps++ go/no-go

Date: 2026-07-07 evening. Basis: AUDIT.md (static + live) and HUMANS.md.

## Verdict: **CONDITIONAL GO**

The system is real end-to-end — every sponsor integration was proven live, not simulated
(AUDIT.md "Live Integration"): cloud RocketRide diagnosis, Cypher root-cause over live Aura state,
Daytona sandboxes running the real suite, Butterbase auth/RLS/persisted credits (strict 5→4 in
Postgres), real GitHub PRs with MTTR, deterministic policy gate, and all four "can say no" proofs
green on the last coherent configuration. The demo-rigged fallback (B1) and the orphan-path
verify hole (L2) are fixed. **The single condition:** the patient migration to claimflow +
`pager-zero-demo` started mid-audit and is unfinished — until the scripts/docs match the running
config and both e2e suites pass green again, the demo is unrehearsable. That re-run flips this to
a full GO.

## Top blockers (all trace to AUDIT.md / HUMANS.md)

1. **L1 / HUMANS §3.4 — finish or revert the claimflow migration, then re-run
   `./scripts/e2e.sh` and `./scripts/e2e-negative.sh` to green.** Everything else is secondary.
2. **HUMANS §3.1 — no Stripe plan exists**: don't click Subscribe on stage until one is created in
   test mode, or narrate credits via `DEMO_AUTO_CREDITS` (honest and persisted).
3. **HUMANS §3.3 — never redeploy the frontend built with `VITE_NEO4J_*` set** (local dist bundle
   contains the Aura password; the currently-live deploy is verified clean).

## Fragility risks on stage (live-service dependencies)

| Risk | Mitigation (already in DEMO.md §4) |
| --- | --- |
| RocketRide Cloud cold pipeline / idle WS drop | Boot-time warmup + `/health` reconnect are in; still give it ~2 min after start before the first Diagnose |
| Daytona cold verify takes 2–3 min | Narrate the sandbox panel; a re-click gets a fresh sandbox |
| Aura latency/outage | Graph panel falls back to the `/incident` subgraph automatically |
| GitHub PAT scope/rate | `preflight.sh` names the failing check; PR already proven (e.g. #4 on the old repo) |
| Nebius embed model ID churn | `phase0-smoke` re-verifies and records the dimension |
| Shared demo account (password was public in git) | Anyone could log in and pollute rows before rotation — rotate or accept for the event (HUMANS §3.2) |
| Parallel editing of this repo during rehearsal | The audit observed live clobbering between sessions; freeze the tree before rehearsing |

## Demo-day preflight (exact order)

```bash
./scripts/dev-native.sh stop; sleep 5
./scripts/dev-native.sh            # patient per your L1 decision (PATIENT_REPO env or default)
./scripts/preflight.sh             # must print: PREFLIGHT: all PASS
./scripts/e2e.sh                   # once, the night before — opens a REAL PR
./scripts/e2e-negative.sh          # all 4 "can say no" proofs
./scripts/reset.sh                 # board green
# between runs: ./scripts/reset.sh  (incident rows resolve on ship; open ones are reused)
```

`.env` demo-day values: `DEMO_AUTO_CREDITS=1`, `UNLIMITED_CREDITS=0`, `RESCUEOPS_AGENT_PIPELINE=0`,
`SERVICE_PASSWORD` set (no longer defaulted in code).

## Demo-ready vs production hardening (list only — out of scope for the event)

Demo-ready now: the full incident→diagnose→verify→gate→ship loop, negative proofs, credits/paywall,
Mission Control panels, deployed UI shell.

Production hardening (later): proxy Neo4j reads server-side instead of browser bolt (M-1 root cause);
deterministic multi-candidate root-cause ranking (M-5); real progress events instead of the timed
pipeline animation (m-6); `access_mode=authenticated` (HUMANS §3.7); Stripe production billing; Opsera
account + webhook contract reconciliation; drop the synthetic-balance fallback (M-3); linting (m-19);
compose/native env parity (M-8).

## The single most important thing

**Finish the patient migration and get both e2e scripts green on the final configuration.** Every
integration is individually proven; the only thing between this repo and a clean demo is that the
verification suite, the demo runbook, and the running stack currently describe two different demos.

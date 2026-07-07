# Claude Code Build Prompt — RescueOps++ M8: Mission-Control UI + Paywall

> Paste below the line into Claude Code, run from the repo with M1–M7. The final milestone. Phased
> build: **STOP at every gate** and wait for my "go" / "next".

---

You are building **Milestone 8** of RescueOps++ — the face of the whole thing. Read this entire brief
before writing any code. Follow the operating constraints and **STOP at every gate**.

Everything works; now it has to be *seen*. **M8 is one mission-control screen where a real incident
flows end-to-end:** the code graph lights up the root cause and blast radius, the agent's reasoning
streams, the sandbox proves the fix, a human approves the risky ones, the PR link and MTTR appear —
and a paywall gates the whole thing behind a subscription. Every pixel must trace to a real backend
event; no mocked data.

## 1. Project facts

- New `frontend/` only. It is a **read-and-trigger** client over the existing endpoints (sensor,
  responder) + the Butterbase Data API. It does not change any engine logic.

## 2. Locked stack additions — do not substitute without asking

- **React + Vite** (TypeScript). Deploy via **Butterbase frontend deployment** for a live URL.
- **`react-force-graph`** (or Neo4j **NVL**) for the code graph. No heavy component library — one
  dashboard.
- Data via the **Butterbase TS SDK** (auth + Data API) and the existing responder/sensor HTTP endpoints.

Do **not** add: a new backend, a state library, or anything beyond the single dashboard. **STOP and
make the case** if you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify** any backend (`sensor`, `responder`, Butterbase schema, M1–M7 logic). Frontend only.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** One page, panels fed by real endpoints. No mocked data, no speculative widgets.
   If a panel can't show real data yet, leave it empty — don't fake it.
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts — the panels (all fed by real events)

- **Auth** — Butterbase sign-in.
- **Code graph** — the live Neo4j code graph; on an incident, the `root_cause` node and its
  `blast_radius` light up (from `GET /incident`).
- **Agent trace** — the diagnosis + cited runbook (from `POST /diagnose`).
- **Sandbox** — the Daytona verify result: pass/fail + output, parallel candidates (from `POST /remediate`).
- **Approval** — pending approvals with approve/deny buttons (M7).
- **Ship** — the PR link + MTTR (M6).
- **Paywall / credits** — current `apply_credits`; at 0 the apply action shows **Subscribe** (Butterbase
  monetization checkout); subscribing refills and unlocks apply.

## Phases — STOP at each gate

**Phase 0 — scaffold + auth + data.** Vite React app; Butterbase sign-in; fetch `GET /incident` and the
user's Butterbase rows.
→ **verify:** sign-in works; the current incident state renders from **real** data. **STOP.**

**Phase 1 — the live panels.** Code graph (force-directed) + agent trace + sandbox output, driven by
triggering the seeded incident.
→ **verify:** run `./scripts/break.sh` with the dashboard open → the graph lights `computeTax` (root)
and `invoiceTotal`/`renderInvoice` (blast radius); the trace shows the diagnosis; the sandbox panel
shows the real verify result. `./scripts/reset.sh` → the board clears. **STOP.**

**Phase 2 — approval + ship + paywall.** Wire the approve/deny button (M7), the PR link + MTTR (M6), and
the credits/subscribe paywall.
→ **verify:** a free user is blocked at apply → **Subscribe** → after checkout (test mode), apply
unlocks. A risky fix shows the approval button → approve → the PR link + MTTR appear and a credit
decrements. **STOP.**

**Phase 3 — deploy.** Deploy the frontend to a live URL via Butterbase frontend deployment.
→ **verify:** the live URL renders the dashboard and the full incident flow works end-to-end on it. **STOP.**

## Out of scope

Nothing beyond the single dashboard — this is the last milestone.

## Definition of done

One mission-control screen, every panel fed by **real** backend events (code graph, agent trace,
sandbox verify, approval, PR + MTTR, credits), deployed to a **live URL** via Butterbase; the seeded
incident flows end-to-end on screen; the paywall gates apply and subscribing unlocks it. Then **STOP
and report**: the live URL, the passing checks, and confirmation that the full RescueOps++ demo runs
end-to-end.

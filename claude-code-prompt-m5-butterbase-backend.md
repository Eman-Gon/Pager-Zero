# Claude Code Build Prompt — RescueOps++ M5: Butterbase Backend (auth + DB + payment)

> Paste below the line into Claude Code, run from the repo with M1–M4. **Needs a Butterbase account**
> (dashboard.butterbase.ai; redeem promo `ENJOY0707` in Billing) — Phase 0 sets it up. Phased build:
> **STOP at every gate** and wait for my "go" / "next".

---

You are building **Milestone 5** of RescueOps++ — the milestone that turns the engine into a product.
Read this entire brief before writing any code. Follow the operating constraints and **STOP at every
gate**.

M3/M4 gave a diagnosing-and-fixing engine. **M5 gives it a real backend: users sign in, incidents
and actions persist, and shipping a fix costs a credit users pay for.** These are the *mandatory*
Butterbase pieces — **database, auth, and payment, all in active use** — plus the AI gateway.
Getting this wrong (payment bolted-on or absent) is a disqualification, so payment must be
**load-bearing**: no plan → no credits → the agent cannot ship a fix.

## 1. Project facts

- Create a Butterbase app; use it as the product's system-of-record + auth + payment.
- Extend `services/responder` to read/write Butterbase and enforce credits. Do not touch `target-repo`,
  the `sensor`, or the M2 graph logic.

## 2. Locked stack additions — do not substitute without asking

- A **Butterbase app** (dashboard.butterbase.ai). Use its built-ins — **do not** hand-roll auth, a
  separate Postgres, or Stripe wiring outside Butterbase's monetization:
  - **Declarative JSON schema** + **automatic Data API** (CRUD over HTTP).
  - **Email/password auth** (JWT).
  - **Row-Level Security** (one call per user-owned table).
  - **Monetization** — Stripe Connect subscribe-to-plan; an active subscription grants credits.
  - **AI model gateway** (OpenAI-compatible) for the agent's LLM calls.
- **Butterbase TypeScript SDK** (confirm the exact package + auth in Phase 0) — used from the responder.

Do **not** add: the GitHub PR / apply (M6), the approval gate (M7), the UI (M8), or changes to
Neo4j/Daytona/RocketRide. **STOP and make the case** if you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify** `target-repo`, the `sensor`, or the M2 code-graph logic. Extend the `responder`
  and add Butterbase config only.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** Lean on Butterbase's built-ins (declarative schema, auto Data API, one-call
   RLS, built-in auth + monetization). Write the minimum glue. No custom backend.
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts

### Butterbase schema (declarative JSON; RLS on all three)

- `incidents { id, user_id, root_cause, blast_radius (json), status, opened_at, resolved_at }`
- `actions   { id, incident_id, user_id, type, candidate_fix (json), verified, applied, approved }`
- `accounts  { user_id, apply_credits (int), plan (text) }`

RLS: a signed-in user reads/writes only their own rows.

### Auth

Email/password via Butterbase. A user signs up → logs in → gets a JWT the responder uses.

### Payment (monetization)

Define **one plan** in Butterbase's Stripe-Connect monetization. An active subscription grants
`apply_credits` on the user's `accounts` row (free tier = 0). Confirm the exact monetization/billing
API in Phase 0.

### Credit enforcement (in the responder)

- `spendCredit(userId)`: if `accounts.apply_credits <= 0` → throw a paywall error; else decrement by 1.
- A guarded stub endpoint `POST /apply-stub` that calls `spendCredit` and returns success/paywall — to
  prove the flow end-to-end (the *real* apply is M6, which will call `spendCredit`).

### Persistence

On diagnose/remediate (M3/M4), the responder writes the `incidents` + `actions` rows for the signed-in
user via the Butterbase Data API/SDK.

### AI gateway

The agent's LLM calls run through **this Butterbase app's gateway** (usage tracked). If M3 wired the
gateway already, just confirm usage shows up under this app.

## Phases — STOP at each gate

**Phase 0 — app + connectivity.** Create the app, redeem the promo, capture `app_id` + API base URL +
API key. Confirm from the docs: the **SDK package + auth**, the **schema apply** API (dry-run first),
and the **monetization/billing** API. One smoke call (e.g. schema dry-run) succeeds.
→ **verify:** the SDK authenticates against your app and a schema dry-run previews cleanly. **STOP.**

**Phase 1 — schema + auth + persistence.** Apply the schema (dry-run → apply), enable RLS, configure
email/password auth. Wire the responder to create `incidents` + `actions` rows for a signed-in user.
→ **verify:** sign up a user → get a token; run `POST /diagnose` (M3) → an `incidents` row + `actions`
row persist, and a *second* user cannot see them (RLS holds). **STOP.**

**Phase 2 — payment + credits.** Define the plan; grant `apply_credits` on active subscription; add
`spendCredit` + `POST /apply-stub`.
→ **verify:** a free user (0 credits) → `POST /apply-stub` returns the paywall error. Subscribe in
Stripe **test mode** → `apply_credits` > 0 → `apply-stub` succeeds and decrements the balance. **STOP.**

## Out of scope — do NOT build (later milestones)

- The real fix apply / GitHub PR / Opsera pipeline + MTTR → M6 (it will call `spendCredit`).
- Human approval gate → M7. Mission-control UI + the subscribe screen → M8.

## Definition of done

A Butterbase app with **database** (incidents/actions/accounts under RLS), **auth** (email/password),
and **payment** (subscribe → `apply_credits`) all in active use; the responder persists incidents and
actions per user and enforces credits via `spendCredit`; the agent's LLM runs through the app's
gateway. Then **STOP and report**: the branch, the passing checks (incl. the paywall block and the
post-subscribe unlock), and one line noting that M6 (Opsera ship → GitHub PR + MTTR, spending a credit
at apply) is next.

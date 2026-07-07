# Claude Code Build Prompt — RescueOps++ M7: Human Approval Gate

> Paste below the line into Claude Code, run from the repo with M1–M6. No new accounts required
> (Twilio optional). Phased build: **STOP at every gate** and wait for my "go" / "next".

---

You are building **Milestone 7** of RescueOps++. Read this entire brief before writing any code.
Follow the operating constraints and **STOP at every gate**.

M6 ships fixes automatically. **M7 makes sure a human signs off on the risky ones first.** A
deterministic policy decides which fixes are safe to auto-ship and which must wait for approval — and
the risk decision is made by **code, not the LLM**.

## 1. Project facts

- Extend `services/responder` (gate `/apply`) and add one Butterbase table. Do not touch the `sensor`,
  the M2 graph, or `target-repo`.

## 2. Locked stack additions — do not substitute without asking

- No new services. A deterministic `policy.json` + one Butterbase `approvals` table.
- **Optional:** Twilio SMS approval (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) —
  a *flavor* on top. The **primary** path is in-app approval (surfaced in the M8 UI).

Do **not** add: the UI itself (M8) or changes to M1–M6 beyond the gate. **STOP and make the case** if
you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify** `target-repo`, the `sensor`, or the M2 logic. Add the `approvals` table, `policy.json`,
  and the gate in `/apply` only.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** The gate is: is this action risky? → if yes, park it as pending; else proceed.
   Nothing more. **The risk decision is deterministic code — never an LLM call.**
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts

### Policy (deterministic `policy.json`)

Marks an action as `requires_approval` by simple rules, e.g.: `severity == "high"`, OR
`blast_radius.length > N`, OR the fix touches a path in a protected list. Pure code evaluates it — no
model involved.

### Butterbase

`approvals { id, action_id, user_id, status: "pending"|"approved"|"denied" }` (RLS: owner only).

### Responder — gate in `POST /apply`

- Evaluate `policy.json` against the incident/action.
- **Auto path** (not risky): proceed to the M6 ship immediately.
- **Gated path** (risky): create a `pending` approval, **do not** open the PR or spend the credit yet;
  return `{ status: "pending_approval", approval_id }`.
- `POST /approvals/:id { decision }`: set `approved`/`denied`. On **approved** → run the M6 ship
  (spend credit → PR → MTTR). On **denied** → abort; no PR, no credit spent.
- **Optional Twilio:** on `pending`, send an SMS summarizing the fix; an approve reply flips the record.

## Phases — STOP at each gate

**Phase 1 — policy + gate.** Add `policy.json`, the `approvals` table, and the gate in `/apply`.
→ **verify:** a **risky** fix (e.g. high severity) → `/apply` returns `pending_approval` and opens **no**
PR and spends **no** credit; a **safe** fix → auto-ships via M6. **STOP.**

**Phase 2 — decide + proceed.** Implement `POST /approvals/:id`.
→ **verify:** approving the pending action → the M6 ship runs (PR opens, credit spent, MTTR recorded);
denying → aborts cleanly (no PR, no credit). **STOP.**

**Phase 3 (optional) — Twilio SMS.** Send the approval request as an SMS; a reply approves.
→ **verify:** a risky fix sends a real SMS; the reply flips the approval and proceeds. **STOP.**

## Out of scope — do NOT build (later milestones)

- The mission-control UI where approvals are surfaced with a button → M8.

## Definition of done

Risky fixes are gated behind a **deterministic** policy and a Butterbase `approvals` record; approving
runs the M6 ship (credit + PR + MTTR), denying aborts with no side effects, and safe fixes auto-proceed.
Then **STOP and report**: the branch, the passing checks (risky→pending, safe→auto, approve→PR,
deny→abort), and one line noting that M8 (mission-control UI + the subscribe/paywall screen — the final
milestone) is next.

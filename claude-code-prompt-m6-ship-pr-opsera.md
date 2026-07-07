# Claude Code Build Prompt — RescueOps++ M6: Ship the Fix (GitHub PR + Opsera + MTTR)

> Paste below the line into Claude Code, run from the repo with M1–M5. **Needs a GitHub repo + token**
> and **Opsera access** — Phase 0 confirms both. Phased build: **STOP at every gate** and wait for my
> "go" / "next".

---

You are building **Milestone 6** of RescueOps++. Read this entire brief before writing any code.
Follow the operating constraints and **STOP at every gate**.

M4 *proved* a fix in a sandbox; M5 made shipping cost a credit. **M6 actually ships it:** it opens a
real GitHub PR containing the verified fix, spends a credit, records time-to-restore, and routes the
ship through an Opsera policy-gated pipeline. The PR is the real, unfakeable action; Opsera adds
governance and metrics on top.

## 1. Project facts

- `target-repo` is pushed to a GitHub repo (the "codebase under care").
- Extend `services/responder` (add the apply/ship path). Do not touch the `sensor` or the M2 graph.
- The GitHub PR is real and works **independently of Opsera** (Opsera is the governance layer, not the
  thing that makes the PR real).

## 2. Locked stack additions — do not substitute without asking

- **`@octokit/rest`** for the GitHub PR. Env: `GITHUB_TOKEN` (repo scope), `GITHUB_REPO` (`owner/name`).
- **Opsera** — a webhook-triggered pipeline with a **policy-as-code gate** + DORA **Time-to-Restore**.
  Confirm the webhook trigger URL/auth and what a pipeline step can do **with the Opsera rep in Phase 0**.

Do **not** add: a second git host, a custom CI, the approval gate (M7), or the UI (M8). **STOP and make
the case** if you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify** `target-repo` locally, the `sensor`, or the M2 logic. The fix reaches the repo
  **only** as a commit on a new branch via the GitHub API — never by editing local files in place.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** Ship path = spend credit → branch + commit + PR → record MTTR. Opsera is a
   thin governance wrapper. Nothing more.
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts

### Responder — `POST /apply`

1. `spendCredit(userId)` (M5) — if no credits, return the paywall error and stop (no PR).
2. Via `@octokit/rest`: create a branch off the default branch, commit the verified `candidate_fix`
   (from M4) to `candidate_fix.path`, open a PR titled after the incident.
3. Mark the `actions` row `applied:true`; set the `incidents` row `status:"resolved"`, `resolved_at`;
   compute and store **MTTR** = `resolved_at - opened_at` (seconds) in Butterbase.
4. Return `{ pr_url, mttr_seconds }`.

### Opsera (Phase 2)

`POST /apply` triggers an **Opsera pipeline via webhook** (payload = fix metadata). The pipeline runs a
**policy-as-code gate** (allowed action types + touched files, from a deterministic `policy.json`) and
records the deployment; pull/emit DORA **Time-to-Restore**. A policy-violating fix is **blocked at the
gate** (no PR). Confirm the exact trigger + gate mechanics in Phase 0.

## Phases — STOP at each gate

**Phase 0 — GitHub + Opsera connectivity.** Push `target-repo` to GitHub. Confirm `@octokit/rest` can
open a PR with `GITHUB_TOKEN`. With the Opsera rep, confirm a custom pipeline can be **webhook-triggered**
and can run a policy gate.
→ **verify:** a throwaway PR opens (and can be closed); an Opsera webhook fires a trivial pipeline. **STOP.**

**Phase 1 — credit-gated PR + MTTR.** Implement `POST /apply` per §5 (no Opsera yet).
→ **verify:** with a verified fix (M4) and a subscribed user, `POST /apply` opens a **real PR** whose
diff is the corrected `computeTax`, decrements a credit, and records a non-zero MTTR in Butterbase. A
0-credit user → paywall, **no PR**. **STOP.**

**Phase 2 — Opsera gate + metrics.** Route `/apply` through the Opsera pipeline (webhook) with the
policy gate; record DORA Time-to-Restore.
→ **verify:** an allowed fix → pipeline runs → PR opens; a policy-violating fix (e.g. action type not in
the allowlist) is **blocked at the gate**, no PR; Time-to-Restore is retrievable. **STOP.**

## Out of scope — do NOT build (later milestones)

- Human approval gate → M7 (it will sit *in front of* `/apply`).
- Mission-control UI → M8.

## Definition of done

`POST /apply` opens a **real, credit-gated GitHub PR** containing the verified fix, records MTTR in
Butterbase, and (Phase 2) routes through an **Opsera policy-gated pipeline** that blocks disallowed
fixes. Then **STOP and report**: the branch, the passing checks (incl. the paywall block and the policy
block), the PR URL, and one line noting that M7 (human approval gate on risky fixes, in front of
`/apply`) is next.

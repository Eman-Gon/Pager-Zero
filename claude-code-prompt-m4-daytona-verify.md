# Claude Code Build Prompt — RescueOps++ M4: Daytona Verify-Loop

> Paste below the line into Claude Code, run from the repo with `target-repo` (M1), the `sensor` +
> Neo4j stack (M2), and the `responder` + `diagnose.pipe` (M3). **Needs a Daytona account** — Phase 0
> verifies it before building. Phased build: **STOP at every gate** and wait for my "go" / "next".

---

You are building **Milestone 4** of RescueOps++. Read this entire brief before writing any code.
Follow the operating constraints and **STOP at every gate**.

M3 diagnoses the incident (root cause + proposed approach), read-only. **M4 makes it act — safely.**
The agent now produces a *concrete candidate fix* and **proves it against the real test suite inside
a Daytona sandbox** before anything is accepted. A fix that doesn't turn the tests green is rejected.
This is the bonus track and the technical centerpiece: the agent doesn't *claim* a fix works, it
*demonstrates* it.

**The rule that defines correctness (the anti-rubber-stamp invariant):** a candidate is `verified`
only if the real test suite exits green **in the sandbox**. A deliberately-bad candidate MUST come
back `verified:false`. If the loop can't say no, it isn't real.

## 1. Project facts

- Extends `services/responder` (adds the verify-loop) and `diagnose.pipe` (adds a concrete fix to its
  output). Reads `target-repo`; does not modify it, the `sensor`, or the M2 graph logic.
- Fix verification runs on **Daytona**, not locally.

## 2. Locked stack additions — do not substitute without asking

- **`@daytona/sdk`** (the current package; `@daytonaio/sdk` is the old alias — either works, the API
  is identical). Configured via `DAYTONA_API_KEY` (constructor or env).
- No new services, no new languages. The verify-loop lives in the existing `responder`.

Do **not** add: Opsera, Twilio, Butterbase auth/payment/persistence, GitHub PR logic, or a UI (later
milestones). **STOP and make the case** if you think you need one.

## 3. Surgical rule (with the operating constraints)

- **Do not modify** `target-repo`, the `sensor`, or the M2 code-graph logic.
- You may **extend** `diagnose.pipe` (add `candidate_fix` to its JSON output) and the `responder`
  (add the verify-loop). Nothing else.

## 4. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions; present interpretations; push back if simpler exists.
2. **Simplicity first.** The loop is: get candidate → sandbox → apply → test → accept/reject → clean
   up. The candidate is a full corrected file, not a diff (full-file replace applies reliably;
   patches don't). Nothing more.
3. **Surgical.** Every changed line traces to this brief. See §3.
4. **Goal-driven.** Each phase has a verify gate; prove it before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 5. Contracts

### Pipeline extension (`diagnose.pipe`)

Add to the JSON output:
`candidate_fix: { path: string, content: string }` — the **full corrected source** of the
root-cause file (e.g. `path:"src/tax.ts"`, `content:` the whole file with `computeTax` fixed).
Full-file, not a patch.

### Responder verify-loop — `POST /remediate`

1. Run the M3 flow to get the diagnosis **and** `candidate_fix`.
2. **Verify in Daytona:**
   a. `const daytona = new Daytona({ apiKey })`; `daytona.create({ language: 'typescript' })`.
   b. Get `target-repo` into the sandbox (it's mounted at `/target`): tar the repo **excluding
      `node_modules`**, upload the tarball via the fs API, extract it in the sandbox.
   c. `sandbox.process.executeCommand('npm install', <repoDir>, undefined, 300)`.
   d. Write `candidate_fix.content` to `<repoDir>/<candidate_fix.path>` (fs write/upload).
   e. `sandbox.process.executeCommand('npm test', <repoDir>, undefined, 120)` — `verified = exitCode
      === 0`. (`target-repo`'s `test` script must be non-watch, e.g. `vitest run`.)
   f. `sandbox.delete()` in a `finally`.
3. Return `{ verified: boolean, candidate_fix, test_output: string }`.

Add `DAYTONA_API_KEY` (+ optional `DAYTONA_API_URL`) to the `responder` env in Compose.

## Phases — STOP at each gate

**Phase 0 — Daytona connectivity smoke (before building the loop).** A throwaway script:
`create({language:'typescript'})` → `executeCommand('node -v')` → assert the version prints →
`delete()`.
→ **verify:** the command's output comes back from a real sandbox and the sandbox is deleted. **STOP.**

**Phase 1 — single-candidate verify-loop.** Extend `diagnose.pipe` with `candidate_fix`; build
`POST /remediate` per §5.
→ **verify:** with the seeded incident live (`./scripts/break.sh`), `curl -XPOST :3004/remediate`
returns `verified:true`, and `test_output` shows the **real** vitest run passing in the sandbox
(the corrected `computeTax` makes the previously-failing tests green). Then the **reject check**:
feed a knowingly-bad candidate (e.g. the still-buggy source) through the same loop → `verified:false`
with the failing test in `test_output`. Both must hold. **STOP.**

**Phase 2 — snapshot + parallel candidates.** Build a Daytona **snapshot** of the repo with
`node_modules` pre-installed (so sandboxes start ready). Generate **N** candidate fixes (ask the
pipeline for a few), create N sandboxes from the snapshot, apply + `npm test` **in parallel**, and
select the first `verified:true`.
→ **verify:** N sandboxes run concurrently (visible via `daytona.list()` mid-run), at least one
returns `verified:true`, and the selected fix is a verified one. Snapshot reuse makes each run skip
`npm install`. **STOP.**

## Out of scope — do NOT build (later milestones)

- **Applying** the verified fix to the real repo / opening a **GitHub PR** / the Opsera ship pipeline
  + MTTR → M6.
- Butterbase **auth, payment (credits), persistence** → M5 (note: the credit that a remediation
  *spends* is metered there — M4 just proves the fix).
- Human approval gate → M7. Any UI → M8.

## Definition of done

`POST /remediate` produces a concrete candidate fix and **proves it in a real Daytona sandbox**:
a correct fix returns `verified:true` with a passing sandbox test run, and a bad candidate returns
`verified:false`. Phase 2 runs candidates in parallel from a pre-installed snapshot. Then **STOP and
report**: the branch, the passing checks (including the reject case), and one line noting that M5
(Butterbase backend — auth + DB + the **credits/payment** flow that meters remediations, + wiring
the AI gateway) is next.

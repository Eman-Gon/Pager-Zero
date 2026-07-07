# Claude Code Build Prompt — RescueOps++ M1: The Target Repo ("the patient")

> Paste everything below the line into Claude Code from a **new empty folder**. This supersedes
> the earlier services-based M1 — start fresh. No API keys. Phased build: **STOP at every gate**
> and wait for my "go" / "next". Do not run phases unattended.

---

You are building **Milestone 1** of RescueOps++, an autonomous on-call engineer for a **codebase**.
Read this entire brief before writing any code. Follow the operating constraints exactly and
**STOP at every gate**.

RescueOps++ (built over later milestones) will watch a codebase, detect when a commit breaks it,
diagnose the root cause through a code graph, write and prove a fix, and ship it. **M1 builds the
thing it operates on: a small, real repo with a real test suite and a seeded "incident" — a bad
commit that genuinely breaks tests.** M1 contains *none* of the RescueOps++ system itself.

## 1. Project facts

- Create a self-contained git repo at **`./target-repo`** (its own `git init`).
- TypeScript library + **vitest** test suite. Plain exported functions only.
- Local-first, no Docker, no keys.

## 2. Locked stack — do not substitute without asking

- **TypeScript + Node 20**, ESM (`"type":"module"`).
- **vitest** for tests. **No** other test runner.
- Plain **exported functions** that call each other **directly** — no classes, no dependency
  injection, no indirection. (This is deliberate: M2 statically analyzes the call graph, so the
  graph must be clean and resolvable.)

Do **not** add: a web server, a database, a build step, any sponsor SDK, or a framework. This is
a plain library + tests + git. If you think you need more, **STOP and make the case.**

## 3. Operating constraints (override your defaults)

1. **Think before coding.** State assumptions. Present interpretations — don't pick silently.
2. **Simplicity first.** Minimum code. The library is ~5 tiny functions. Nothing speculative.
3. **Surgical.** Every line traces to this brief.
4. **Goal-driven.** Each phase has a verify gate; prove it passes before declaring done.
5. **STOP at each phase gate** for my go-signal.

## 4. The library (exact — this defines the call graph M2 will read)

Four files under `target-repo/src/`, each function `export`ed:

- `tax.ts` → `computeTax(amount: number, rate: number): number` returns `amount * rate`.
- `discount.ts` → `applyDiscount(amount: number, pct: number): number` returns `amount * (1 - pct)`.
- `total.ts`:
  - `lineTotal(price: number, qty: number): number` returns `price * qty`.
  - `invoiceTotal(items: {price:number; qty:number}[], taxRate: number, discountPct: number): number`
    — sums `lineTotal` over items, applies `applyDiscount`, then adds `computeTax` on the
    discounted subtotal. **Calls `lineTotal`, `applyDiscount`, `computeTax`.**
- `format.ts`:
  - `formatCurrency(n: number): string` returns `"$" + n.toFixed(2)`.
  - `renderInvoice(items, taxRate, discountPct): string` returns
    `formatCurrency(invoiceTotal(...))`. **Calls `invoiceTotal`, `formatCurrency`.**

Resulting call graph (leaves at bottom):
```
renderInvoice → invoiceTotal → { lineTotal, applyDiscount, computeTax }
renderInvoice → formatCurrency
```

## 5. Tests

One test file per source file under `target-repo/test/`, importing from `../src/...`. Each function
gets at least one assertion with concrete expected values. **Required (the incident depends on
these being real, deterministic assertions):**
- `computeTax(100, 0.1)` ⇒ `10`.
- an `invoiceTotal` test whose expected value depends on `computeTax` being correct (so it fails
  when `computeTax` is wrong).
- a `renderInvoice` test (so the blast radius reaches it).

## 6. The seeded incident (deterministic, repeatable)

- `scripts/break.sh` — flips `computeTax` to a wrong operator in `target-repo/src/tax.ts`
  (`amount * rate` → `amount + rate`) via `sed`, then commits inside `target-repo`
  (`git commit -am "incident: bad tax calc"`). This is a **real bad commit**, not a flag.
- `scripts/reset.sh` — `git -C target-repo reset --hard good` (restores the pre-incident state).

The good state must be committed and tagged **`good`** so reset is exact.

## Phases — STOP at each gate

**Phase 0 — library + tests + clean git.** Build §4 and §5. `git init` in `target-repo`, commit
the passing state, tag it `good`.
→ **verify:** `cd target-repo && npm install && npm test` — all green; `git tag` lists `good`. **STOP.**

**Phase 1 — incident tooling.** Add `scripts/break.sh` and `scripts/reset.sh` per §6.
→ **verify:** `./scripts/break.sh` → `cd target-repo && npm test` now **fails**, and the failures
are exactly the `computeTax` test plus the tests that transitively depend on it (`invoiceTotal`,
`renderInvoice`) — the `discount`/`lineTotal`/`formatCurrency` tests still pass. `./scripts/reset.sh`
→ `npm test` all green again. **STOP.**

## Out of scope — do NOT build (later milestones)

The sensor, Neo4j, the code graph, the RocketRide agent crew, Nebius, Daytona, Butterbase, Opsera,
Twilio, any UI. M1 is **only** the target repo + its tests + the break/reset incident tooling.

## Definition of done

`target-repo` is a git repo whose tests pass at tag `good`; `./scripts/break.sh` introduces a real
bad commit that fails exactly the `computeTax`-dependent tests; `./scripts/reset.sh` restores green.
Then **STOP and report**: the branch/commit state, which tests fail under the incident, and one line
noting that M2 (sensor + Neo4j **code** dependency graph + root-cause traversal) is the next slice.

# Patient repos

A library of small, self-contained TypeScript libraries — each a "patient" the
sensor can diagnose. Every patient has its own git repo, a `good` tag marking a
clean passing state, and one scripted bug in a **leaf function** (so the code
graph resolves a clear root cause) that its callers depend on (so there's a real
blast radius).

The sensor scans exactly one repo at a time: whatever is in `target-repo/`. Use
the loader to swap a patient in.

## Catalog

| Patient | File | Bug class | Root cause → blast radius |
| ------- | ---- | --------- | ------------------------- |
| `claimflow` | `src/riskScore.ts` | Off-by-one loop boundary | `sumRiskWeights` → `computeRiskScore` |
| `billing` | `src/invoice.ts` | Wrong arithmetic operator (`+` vs `*`) | `computeTax` → `invoiceTotal`, `renderInvoice` |
| `pricing` | `src/pricing.ts` | Percentage-vs-fraction mismatch | `applyDiscount` → `cartTotal`, `checkout` |
| `eligibility` | `src/coverage.ts` | Off-by-one comparison (`>` vs `>=`) | `meetsAgeRequirement` → `isEligible`, `canSubmitClaim` |
| `identity` | `src/normalize.ts` | Incomplete string normalization | `normalizeEmail` → `accountKey`, `sameUser` |
| `riskgate` | `src/threshold.ts` | Missing null/NaN guard | `parseThreshold` → `isHighRisk`, `flagClaim` |

## Workflow

```bash
# 1. Load a patient into target-repo (clean baseline, tagged `good`)
scripts/load-patient.sh billing

# 2. Restart the sensor so it rebuilds the code graph for the new source tree
docker compose restart sensor        # (or restart the native sensor process)

# 3. In Mission Control: "Break production" injects the bug (POST /demo/break),
#    then watch detect → diagnose → verify → ship.
#    "Restore" resets to `good` (POST /demo/reset).
```

The bug for each patient is registered in the sensor's `DEMO_BREAKS` catalog
(`services/sensor/src/index.ts`), keyed by source file, so the same UI buttons
work for whichever patient is loaded.

## Adding a patient

1. Create `patients/<name>/` with `package.json`, `tsconfig.json`, `src/`, `test/`.
2. Put the bug in an **exported leaf function** (calls no other function in its
   own file) with at least one caller and a test that fails when broken.
3. `git init && git add -A && git commit && git tag good` (commit the clean state).
4. Register the single-line `from`/`to`/`message` break in `DEMO_BREAKS`.

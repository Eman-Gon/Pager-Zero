#!/usr/bin/env bash
# Incident: off-by-one loop boundary in sumRiskWeights (src/riskScore.ts).
# Changes `i < codes.length` to `i <= codes.length`, which reads one
# element past the end of the codes array on every call. The extra
# undefined code falls through to the default weight of 1, inflating
# every risk score by 1 and cascading into pricing, approval, and the
# top-level processClaim summary.
set -euo pipefail

cd "$(dirname "$0")/.."
cd patients/claimflow

sed -i '' 's/for (let i = 0; i < codes.length; i++) {/for (let i = 0; i <= codes.length; i++) {/' src/riskScore.ts

git commit -am "incident: off-by-one loop boundary in sumRiskWeights inflates every risk score by 1"

echo "Incident injected in patients/claimflow (off-by-one in sumRiskWeights)."

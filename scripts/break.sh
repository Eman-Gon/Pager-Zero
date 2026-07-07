#!/usr/bin/env bash
# Seed the incident: flip computeTax to a wrong operator and commit the bad change.
set -euo pipefail
cd "$(dirname "$0")/../target-repo"
sed -i '' 's/amount \* rate/amount + rate/' src/tax.ts
git commit -am "incident: bad tax calc"

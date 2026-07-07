#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
git -C patients/claimflow reset --hard good
echo "patients/claimflow reset to tag 'good'."

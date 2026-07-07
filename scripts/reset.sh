#!/usr/bin/env bash
# Restore the pre-incident state exactly.
set -euo pipefail
cd "$(dirname "$0")/.."
git -C target-repo reset --hard good

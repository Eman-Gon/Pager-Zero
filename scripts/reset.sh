#!/usr/bin/env bash
# Restore the pre-incident state exactly (target-repo → tag 'good').
# Prefers the sensor's /demo/reset (same as the UI "Restore" button) so the
# sensor rescans immediately; falls back to a direct git reset.
set -euo pipefail

SENSOR_URL="${SENSOR_URL:-http://127.0.0.1:3003}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if out=$(curl -sf -m 15 -X POST "$SENSOR_URL/demo/reset" 2>/dev/null); then
  echo "sensor /demo/reset → $out"
  exit 0
fi

git -C "$ROOT/target-repo" reset --hard good
echo "target-repo reset to tag 'good' (sensor was not reachable — it will rescan on next poll)."

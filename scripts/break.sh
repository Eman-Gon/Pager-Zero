#!/usr/bin/env bash
# Seed the loaded patient's scripted incident in target-repo.
# Uses the sensor's patient-aware /demo/break endpoint (same as the UI
# "Break production" button), so it works for any loaded patient.
set -euo pipefail

SENSOR_URL="${SENSOR_URL:-http://127.0.0.1:3003}"

if out=$(curl -sf -m 15 -X POST "$SENSOR_URL/demo/break"); then
  echo "sensor /demo/break → $out"
  exit 0
fi

echo "Sensor not reachable at $SENSOR_URL — start the stack first:" >&2
echo "  ./scripts/dev-native.sh" >&2
exit 1

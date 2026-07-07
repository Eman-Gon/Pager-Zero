#!/usr/bin/env bash
# One-command stack: sensor + responder + Mission Control (nginx).
# Uses API keys from .env (Neo4j Aura, RocketRide Cloud, Butterbase, …).
#
#   ./scripts/docker-up.sh          # build + start (foreground)
#   ./scripts/docker-up.sh -d       # detached
#   ./scripts/docker-up.sh down     # stop
#
# Optional profiles:
#   --profile local-neo4j       local Neo4j instead of Aura
#   --profile local-rocketride  local RocketRide engine instead of Cloud
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing $ROOT/.env — copy .env.example and fill in API keys."
  exit 1
fi

if [[ ! -d "$ROOT/target-repo" ]]; then
  echo "Missing $ROOT/target-repo — clone or create the patient repo first."
  exit 1
fi

if [[ "${1:-}" == "down" ]]; then
  exec docker compose down "${@:2}"
fi

exec docker compose up --build "$@"

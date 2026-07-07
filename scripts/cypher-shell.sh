#!/usr/bin/env bash
# Connect to Neo4j using .env (Aura) or local Docker defaults.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

URI="${NEO4J_URL:-${NEO4J_URI:-bolt://localhost:7687}}"
USER="${NEO4J_USER:-${NEO4J_USERNAME:-neo4j}}"
PASS="${NEO4J_PASSWORD:-devpassword}"
DB="${NEO4J_DATABASE:-}"

ARGS=(-a "$URI" -u "$USER" -p "$PASS")
if [[ -n "$DB" ]]; then
  ARGS+=(-d "$DB")
fi

exec cypher-shell "${ARGS[@]}" "$@"

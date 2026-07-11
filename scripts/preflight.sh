#!/usr/bin/env bash
# RescueOps++ final-verification Phase 0: preflight.
# Proves the system is actually up and configured. Prints PASS/FAIL per item
# and exits non-zero if anything fails. Read-only: creates nothing except a
# throwaway Daytona sandbox (deleted by the smoke script itself).
#
#   ./scripts/preflight.sh          # all checks
#   SKIP_DAYTONA=1 ./scripts/preflight.sh   # skip the slow sandbox check
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SENSOR_URL="${SENSOR_URL:-http://127.0.0.1:3003}"
RESPONDER_URL="${RESPONDER_URL:-http://127.0.0.1:3004}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:5174}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

FAILURES=0

report() {
  # report PASS|FAIL <name> <detail>
  local status=$1 name=$2 detail=$3
  printf '%-4s  %-28s %s\n' "$status" "$name" "$detail"
  if [[ "$status" == "FAIL" ]]; then
    FAILURES=$((FAILURES + 1))
  fi
}

# --- 1. Required env vars ----------------------------------------------------
have_var() {
  local name=$1
  [[ -n "${!name:-}" ]]
}

check_var_group() {
  # check_var_group <label> <var> [alt-var]
  local label=$1 primary=$2 alt=${3:-}
  if have_var "$primary" || { [[ -n "$alt" ]] && have_var "$alt"; }; then
    report PASS "env:$label" "set"
  else
    if [[ -n "$alt" ]]; then
      report FAIL "env:$label" "neither $primary nor $alt is set"
    else
      report FAIL "env:$label" "$primary is not set"
    fi
  fi
}

echo "--- env vars"
check_var_group NEO4J_URI NEO4J_URI NEO4J_URL
check_var_group NEO4J_USERNAME NEO4J_USERNAME NEO4J_USER
check_var_group NEO4J_PASSWORD NEO4J_PASSWORD
check_var_group LLM_PROVIDER LLM_PROVIDER
check_var_group BUTTERBASE_APP_ID BUTTERBASE_APP_ID
check_var_group BUTTERBASE_API_KEY BUTTERBASE_API_KEY
check_var_group BUTTERBASE_API_URL BUTTERBASE_API_URL
check_var_group BUTTERBASE_GATEWAY_URL BUTTERBASE_GATEWAY_URL
check_var_group NEBIUS_BASE_URL NEBIUS_BASE_URL
check_var_group NEBIUS_API_KEY NEBIUS_API_KEY
check_var_group NEBIUS_EMBED_MODEL NEBIUS_EMBED_MODEL
check_var_group DAYTONA_API_KEY DAYTONA_API_KEY
check_var_group GITHUB_TOKEN GITHUB_TOKEN
check_var_group GITHUB_REPO GITHUB_REPO
check_var_group SERVICE_EMAIL SERVICE_EMAIL
check_var_group SERVICE_PASSWORD SERVICE_PASSWORD

# --- 2. Services up ----------------------------------------------------------
echo "--- services"
incident_body=$(curl -sf -m 10 "$SENSOR_URL/incident" 2>/dev/null || true)
if [[ "$incident_body" == *'"status"'* ]]; then
  report PASS "sensor:/incident" "responds ($SENSOR_URL)"
else
  report FAIL "sensor:/incident" "no valid response from $SENSOR_URL/incident"
fi

health_code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$RESPONDER_URL/health" 2>/dev/null || true)
if [[ "$health_code" == "200" ]]; then
  report PASS "responder:/health" "HTTP 200 ($RESPONDER_URL)"
else
  report FAIL "responder:/health" "HTTP ${health_code:-none} from $RESPONDER_URL/health"
fi

# --- 3. LLM gateway -------------------------------------------------------------
echo "--- llm"
conn_body=$(curl -sf -m 20 "$RESPONDER_URL/connection" 2>/dev/null || true)
if [[ -z "$conn_body" ]]; then
  report FAIL "llm:configured" "no response from $RESPONDER_URL/connection"
elif [[ "$conn_body" == *'"configured":true'* || "$conn_body" == *'"configured": true'* ]]; then
  report PASS "llm:configured" "$conn_body"
else
  report FAIL "llm:configured" "LLM not configured: $conn_body"
fi

# --- 4. Butterbase auth (sign in the test user) --------------------------------
echo "--- butterbase auth"
bb_out=$(cd "$ROOT/services/responder" && node --input-type=module -e '
import { createClient } from "@butterbase/sdk";
const client = createClient({
  appId: process.env.BUTTERBASE_APP_ID,
  apiUrl: process.env.BUTTERBASE_API_URL || "https://api.butterbase.ai",
  persistSession: false,
});
const res = await client.auth.signIn({
  email: process.env.SERVICE_EMAIL,
  password: process.env.SERVICE_PASSWORD,
});
if (res.error || !res.data) {
  console.log("SIGNIN_FAIL " + (res.error?.message ?? "no session"));
  process.exit(1);
}
const token = res.data.access_token ?? client.getAccessToken();
console.log(token ? "SIGNIN_OK" : "SIGNIN_FAIL no access token");
process.exit(token ? 0 : 1);
' 2>&1 | tail -1)
if [[ "$bb_out" == "SIGNIN_OK" ]]; then
  report PASS "butterbase:auth" "signed in ${SERVICE_EMAIL:-<unset>}"
else
  report FAIL "butterbase:auth" "$bb_out"
fi

# --- 5. Daytona sandbox create+delete -----------------------------------------
echo "--- daytona"
if [[ "${SKIP_DAYTONA:-0}" == "1" ]]; then
  report PASS "daytona:sandbox" "SKIPPED by SKIP_DAYTONA=1"
else
  day_out=$(cd "$ROOT/scripts/phase0-daytona" && node smoke.mjs 2>&1 | tail -2 | tr '\n' ' ')
  if [[ "$day_out" == *"PASS  daytona"* ]]; then
    report PASS "daytona:sandbox" "created, ran node -v, deleted"
  else
    report FAIL "daytona:sandbox" "$day_out"
  fi
fi

# --- 6. GitHub token reaches the repo ------------------------------------------
echo "--- github"
gh_code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${GITHUB_TOKEN:-}" \
  "https://api.github.com/repos/${GITHUB_REPO:-}" 2>/dev/null || true)
if [[ "$gh_code" == "200" ]]; then
  report PASS "github:repo" "token reaches ${GITHUB_REPO:-<unset>}"
else
  report FAIL "github:repo" "HTTP ${gh_code:-none} for repos/${GITHUB_REPO:-<unset>}"
fi

# --- 7. Frontend URL ------------------------------------------------------------
echo "--- frontend"
fe_code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$FRONTEND_URL" 2>/dev/null || true)
if [[ "$fe_code" == "200" ]]; then
  report PASS "frontend:url" "HTTP 200 ($FRONTEND_URL)"
else
  report FAIL "frontend:url" "HTTP ${fe_code:-none} from $FRONTEND_URL"
fi

# --- summary ---------------------------------------------------------------------
echo "---"
if [[ "$FAILURES" -eq 0 ]]; then
  echo "PREFLIGHT: all PASS"
  exit 0
fi
echo "PREFLIGHT: $FAILURES check(s) FAILED"
exit 1

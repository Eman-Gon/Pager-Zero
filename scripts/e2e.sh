#!/usr/bin/env bash
# RescueOps++ final-verification Phase 1: end-to-end happy path.
# Runs the full incident lifecycle against the LIVE system and asserts each
# stage. Exits non-zero on the first failure. No mocks — every step hits the
# real sensor, responder, LLM, Daytona, Butterbase, and GitHub.
#
#   ./scripts/e2e.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SENSOR_URL="${SENSOR_URL:-http://127.0.0.1:3003}"
RESPONDER_URL="${RESPONDER_URL:-http://127.0.0.1:3004}"

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

# --- patient-aware expectations ------------------------------------------------
# Detect which patient is loaded in target-repo and set the expected incident
# shape. Add a case here when introducing a new patient fixture.
if [[ -f "$ROOT/target-repo/src/riskScore.ts" ]]; then
  EXPECT_ROOT="sumRiskWeights"
  EXPECT_BLAST_A="computeRiskScore"
  EXPECT_BLAST_B="processClaim"
elif [[ -f "$ROOT/target-repo/src/tax.ts" ]]; then
  EXPECT_ROOT="computeTax"
  EXPECT_BLAST_A="invoiceTotal"
  EXPECT_BLAST_B="renderInvoice"
else
  echo "FAIL  cannot identify the loaded patient in target-repo/src" >&2
  exit 1
fi

STEP=0
step() {
  STEP=$((STEP + 1))
  echo ""
  echo "=== step $STEP: $1"
}

fail() {
  echo "FAIL  $*"
  exit 1
}

ok() {
  echo "OK    $*"
}

# --- step 1: reset, sign in, credits > 0 --------------------------------------
step "reset + sign in + credits"
"$ROOT/scripts/reset.sh" >/dev/null || fail "reset.sh failed"

TOKEN=$(cd "$ROOT/services/responder" && node --input-type=module -e '
import { createClient } from "@butterbase/sdk";
const client = createClient({ appId: process.env.BUTTERBASE_APP_ID, apiUrl: process.env.BUTTERBASE_API_URL || "https://api.butterbase.ai", persistSession: false });
const res = await client.auth.signIn({ email: process.env.SERVICE_EMAIL, password: process.env.SERVICE_PASSWORD });
if (res.error || !res.data) { console.error(res.error?.message ?? "no session"); process.exit(1); }
console.log(res.data.access_token ?? client.getAccessToken());
process.exit(0);
') || fail "Butterbase sign-in failed"
ok "signed in ${SERVICE_EMAIL}"

account=$(curl -sf -m 30 -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/account") || fail "GET /account failed"
credits_before=$(echo "$account" | jq -r '.apply_credits // 0')
[[ "$credits_before" -gt 0 ]] || fail "test user has no credits (apply_credits=$credits_before) — cannot ship"
ok "credits: $credits_before (plan: $(echo "$account" | jq -r '.plan'))"

# --- step 2: break -> incident detected ----------------------------------------
step "break.sh -> sensor detects incident"
"$ROOT/scripts/break.sh" >/dev/null || fail "break.sh failed"

incident=""
for _ in $(seq 1 45); do
  incident=$(curl -sf -m 10 "$SENSOR_URL/incident" || true)
  [[ $(echo "$incident" | jq -r '.status // empty') == "incident" ]] && break
  sleep 2
done
[[ $(echo "$incident" | jq -r '.status // empty') == "incident" ]] || fail "sensor never reported an incident: $incident"
root=$(echo "$incident" | jq -r '.root_cause')
[[ "$root" == "$EXPECT_ROOT" ]] || fail "root_cause is '$root', expected $EXPECT_ROOT"
echo "$incident" | jq -e --arg a "$EXPECT_BLAST_A" --arg b "$EXPECT_BLAST_B" \
  '.blast_radius | index($a) and index($b)' >/dev/null \
  || fail "blast_radius missing $EXPECT_BLAST_A/$EXPECT_BLAST_B: $(echo "$incident" | jq -c '.blast_radius')"
ok "root_cause=$EXPECT_ROOT, blast_radius=$(echo "$incident" | jq -c '.blast_radius')"

# --- step 3: diagnose via LLM ---------------------------------------------------
step "POST /diagnose (LLM)"
# -m 300: diagnosis is a single LLM call (no pipeline cold-start).
diagnosis=$(curl -sf -m 300 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/diagnose") || fail "POST /diagnose failed"
[[ $(echo "$diagnosis" | jq -r '.status') == "incident" ]] || fail "diagnose returned: $diagnosis"
echo "$diagnosis" | jq -e --arg r "$EXPECT_ROOT" '.diagnosis.root_cause_explanation | test($r)' >/dev/null \
  || fail "diagnosis does not name $EXPECT_ROOT: $(echo "$diagnosis" | jq -c '.diagnosis.root_cause_explanation')"
runbook=$(echo "$diagnosis" | jq -r '.diagnosis.cited_runbook // empty')
[[ -n "$runbook" ]] || fail "diagnosis has no cited_runbook"
ok "names $EXPECT_ROOT, severity=$(echo "$diagnosis" | jq -r '.diagnosis.severity'), cited_runbook=\"$runbook\""

# --- step 4: remediate -> verified in Daytona ------------------------------------
step "POST /remediate (Daytona sandbox verify — takes minutes)"
remediation=$(curl -sf -m 900 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/remediate") || fail "POST /remediate failed"
[[ $(echo "$remediation" | jq -r '.verified') == "true" ]] || fail "fix not verified: $(echo "$remediation" | jq -c '{verified, test_output: (.test_output | .[0:300])}')"
echo "$remediation" | jq -e '.test_output | test("passed|PASS")' >/dev/null \
  || fail "test_output does not show a passing run"
ok "verified=true, fix path=$(echo "$remediation" | jq -r '.candidate_fix.path')"

# --- steps 5+6: apply (policy gate -> approval if risky) -> PR + credit + MTTR ----
step "POST /apply (policy gate + ship)"
apply_out=$(curl -s -m 300 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/apply") || fail "POST /apply failed"

if [[ $(echo "$apply_out" | jq -r '.status // empty') == "pending_approval" ]]; then
  approval_id=$(echo "$apply_out" | jq -r '.approval_id')
  ok "policy gated the fix (reasons: $(echo "$apply_out" | jq -c '.reasons')) — approving $approval_id"
  apply_out=$(curl -s -m 300 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"decision":"approved"}' "$RESPONDER_URL/approvals/$approval_id") || fail "POST /approvals/$approval_id failed"
  [[ $(echo "$apply_out" | jq -r '.status') == "approved" ]] || fail "approval did not ship: $apply_out"
else
  ok "policy allowed auto-ship"
fi

pr_url=$(echo "$apply_out" | jq -r '.pr_url // empty')
mttr=$(echo "$apply_out" | jq -r '.mttr_seconds // 0')
[[ "$pr_url" == https://github.com/* ]] || fail "no real PR URL in response: $apply_out"
[[ "$mttr" -gt 0 ]] || fail "MTTR not recorded (mttr_seconds=$mttr)"
ok "PR: $pr_url  (MTTR ${mttr}s)"

# --- step 7: Butterbase reflects the ship ------------------------------------------
step "Butterbase state: incident resolved, action applied, credit spent"
state=$(cd "$ROOT/services/responder" && BB_TOKEN="$TOKEN" node --input-type=module -e '
import { createClient } from "@butterbase/sdk";
const client = createClient({ appId: process.env.BUTTERBASE_APP_ID, apiUrl: process.env.BUTTERBASE_API_URL || "https://api.butterbase.ai", persistSession: false });
client.setAccessToken(process.env.BB_TOKEN);
const incidents = (await client.from("incidents").select("*")).data ?? [];
const actions = (await client.from("actions").select("*")).data ?? [];
const resolved = incidents.filter((i) => i.status === "resolved" && i.mttr_seconds > 0);
const applied = actions.filter((a) => a.applied === true);
console.log(JSON.stringify({ resolved: resolved.length, applied: applied.length, open: incidents.filter((i) => i.status === "open").length }));
process.exit(0);
') || fail "Butterbase state query failed"
[[ $(echo "$state" | jq -r '.resolved') -gt 0 ]] || fail "no resolved incident with MTTR in Butterbase: $state"
[[ $(echo "$state" | jq -r '.applied') -gt 0 ]] || fail "no applied action in Butterbase: $state"
ok "butterbase: $state"

account_after=$(curl -sf -m 30 -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/account")
credits_after=$(echo "$account_after" | jq -r '.apply_credits')
plan_after=$(echo "$account_after" | jq -r '.plan')
# Strict: the balance must actually drop by exactly one. This requires the
# `accounts` table to have a uuid `id` column (the Data API only routes
# single-row PATCH as /accounts/:id) and the responder to update by that id.
[[ "$credits_after" -eq $((credits_before - 1)) ]] \
  || fail "credit not decremented: before=$credits_before after=$credits_after (plan=$plan_after) — if the balance did not drop, run services/responder/.accounts-probe.mjs to check accounts writes"
ok "credits: $credits_before -> $credits_after (plan: $plan_after)"

# --- step 8: reset -> all green -------------------------------------------------------
step "reset.sh -> sensor back to ok"
"$ROOT/scripts/reset.sh" >/dev/null || fail "reset.sh failed"
final=""
for _ in $(seq 1 45); do
  final=$(curl -sf -m 10 "$SENSOR_URL/incident" || true)
  [[ $(echo "$final" | jq -r '.status // empty') == "ok" ]] && break
  sleep 2
done
[[ $(echo "$final" | jq -r '.status // empty') == "ok" ]] || fail "sensor did not clear after reset: $final"
ok "incident cleared"

echo ""
echo "E2E: all $STEP steps green"
echo "PR opened during this run: $pr_url"

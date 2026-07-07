#!/usr/bin/env bash
# RescueOps++ final-verification Phase 2: negative paths — the proofs that the
# system can say NO. Four checks, each against the live system:
#   A. Reject   — a knowingly-bad candidate → verified:false, no PR
#   B. Deny     — a risky fix, approval denied → abort, no PR, no credit
#   C. Protected path — a fix touching a protected path → gated, no PR
#   D. Paywall  — a 0-credit user → apply blocked with 402, no PR
# D toggles DEMO_AUTO_CREDITS=0 and restarts the stack, then restores it.
#
#   ./scripts/e2e-negative.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SENSOR_URL="${SENSOR_URL:-http://127.0.0.1:3003}"
RESPONDER_URL="${RESPONDER_URL:-http://127.0.0.1:3004}"
RESPONDER_LOG="$ROOT/.dev/responder.log"

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

fail() { echo "FAIL  $*"; exit 1; }
ok() { echo "OK    $*"; }
section() { echo ""; echo "=== $1"; }

sign_in() {
  (cd "$ROOT/services/responder" && node --input-type=module -e '
import { createClient } from "@butterbase/sdk";
const client = createClient({ appId: process.env.BUTTERBASE_APP_ID, apiUrl: process.env.BUTTERBASE_API_URL || "https://api.butterbase.ai", persistSession: false });
const res = await client.auth.signIn({ email: process.env.SERVICE_EMAIL, password: process.env.SERVICE_PASSWORD });
if (res.error || !res.data) { console.error(res.error?.message ?? "no session"); process.exit(1); }
console.log(res.data.access_token ?? client.getAccessToken());
process.exit(0);
')
}

pr_count() {
  curl -s -m 20 -H "Authorization: Bearer $GITHUB_TOKEN" \
    "https://api.github.com/repos/$GITHUB_REPO/pulls?state=all&per_page=100" | jq 'length'
}

credit_spends() {
  # grep -c prints the count (including 0) itself but exits 1 on no match —
  # don't `|| echo 0` (it would emit a second line and break -eq compares).
  local n
  n=$(grep -c '"event":"demo_credit_spent"' "$RESPONDER_LOG" 2>/dev/null) || true
  echo "${n:-0}"
}

wait_incident() {
  local want=$1
  for _ in $(seq 1 45); do
    local status
    status=$(curl -sf -m 10 "$SENSOR_URL/incident" | jq -r '.status // empty' || true)
    [[ "$status" == "$want" ]] && return 0
    sleep 2
  done
  return 1
}

TOKEN=$(sign_in) || fail "sign-in failed"
PRS_BEFORE=$(pr_count)
ok "signed in; PRs on $GITHUB_REPO: $PRS_BEFORE"

"$ROOT/scripts/reset.sh" >/dev/null
wait_incident ok || fail "sensor not green after reset"

# --- A. Reject: knowingly-bad candidate ----------------------------------------
section "A. reject — bad candidate must come back verified:false"
"$ROOT/scripts/break.sh" >/dev/null
wait_incident incident || fail "incident not detected"

BAD_CONTENT='export function computeTax(amount: number, rate: number): number {\n  return amount + rate;\n}\n'
reject=$(curl -s -m 900 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"candidate_fix\":{\"path\":\"src/tax.ts\",\"content\":\"$BAD_CONTENT\"}}" \
  "$RESPONDER_URL/remediate") || fail "remediate (bad candidate) request failed"
[[ $(echo "$reject" | jq -r '.verified') == "false" ]] || fail "bad candidate was NOT rejected: $(echo "$reject" | jq -c '{verified}')"
echo "$reject" | jq -e '.test_output | test("fail|FAIL")' >/dev/null || fail "reject test_output shows no failing test"
ok "bad candidate rejected (verified:false, failing tests in sandbox output)"

# --- B. Deny: approval denied → abort, no PR, no credit --------------------------
section "B. deny — denied approval aborts with no side effects"
diag=$(curl -sf -m 600 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/diagnose") || fail "diagnose failed"
rem=$(curl -sf -m 900 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/remediate") || fail "remediate failed"
[[ $(echo "$rem" | jq -r '.verified') == "true" ]] || fail "good candidate did not verify"

spends_before=$(credit_spends)
apply_out=$(curl -s -m 60 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/apply")
[[ $(echo "$apply_out" | jq -r '.status // empty') == "pending_approval" ]] \
  || fail "high-severity fix was not gated: $apply_out"
approval_id=$(echo "$apply_out" | jq -r '.approval_id')

deny_out=$(curl -s -m 60 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"decision":"denied"}' "$RESPONDER_URL/approvals/$approval_id") || fail "deny request failed"
[[ $(echo "$deny_out" | jq -r '.status') == "denied" ]] || fail "deny did not stick: $deny_out"
[[ $(pr_count) -eq "$PRS_BEFORE" ]] || fail "a PR appeared after a DENIED approval"
[[ $(credit_spends) -eq "$spends_before" ]] || fail "a credit was spent on a denied approval"
ok "denied → no PR, no credit spent"

# --- C. Policy rules: protected path + blast radius gate; safe fix auto ----------
# The severity rule is system-proven end-to-end in B (gated before any PR via
# the real /apply HTTP path). The remaining rules are deterministic code over
# policy.json — proven here by evaluating the actual policy module. (They can't
# fire live with this incident: a real fix must edit src/tax.ts, so no verified
# action can carry a protected path.)
section "C. policy rules — protected path / blast radius gate, safe fix auto-proceeds"
PROOF_FILE="$ROOT/services/responder/.policy-proof.mts"
cat > "$PROOF_FILE" <<'EOF'
import { evaluatePolicy } from './src/policy.js';
const prot = evaluatePolicy({ severity: 'low', blast_radius: ['a'], fix_path: 'src/payments/charge.ts' });
const blast = evaluatePolicy({ severity: 'low', blast_radius: ['a', 'b', 'c'], fix_path: 'src/tax.ts' });
const safe = evaluatePolicy({ severity: 'low', blast_radius: ['a'], fix_path: 'src/tax.ts' });
console.log(JSON.stringify({
  prot_gated: prot.requires_approval && prot.reasons.join(' ').includes('protected'),
  blast_gated: blast.requires_approval && blast.reasons.join(' ').includes('blast'),
  safe_auto: !safe.requires_approval,
  prot_reasons: prot.reasons,
}));
EOF
policy_out=$(cd "$ROOT/services/responder" && npx tsx .policy-proof.mts)
policy_rc=$?
rm -f "$PROOF_FILE"
[[ "$policy_rc" -eq 0 ]] || fail "policy evaluation failed"
[[ $(echo "$policy_out" | jq -r '.prot_gated') == "true" ]] || fail "protected path not gated: $policy_out"
[[ $(echo "$policy_out" | jq -r '.blast_gated') == "true" ]] || fail "oversized blast radius not gated: $policy_out"
[[ $(echo "$policy_out" | jq -r '.safe_auto') == "true" ]] || fail "safe fix did not auto-proceed: $policy_out"
ok "policy: protected path gated, blast radius gated, safe fix auto ($(echo "$policy_out" | jq -c '.prot_reasons'))"

# --- D. Paywall: 0 credits → 402, no PR -------------------------------------------
section "D. paywall — 0-credit user is blocked at ship"
perl -i -pe 's/^DEMO_AUTO_CREDITS=1$/DEMO_AUTO_CREDITS=0/' "$ROOT/.env"
restore_env() {
  perl -i -pe 's/^DEMO_AUTO_CREDITS=0$/DEMO_AUTO_CREDITS=1/' "$ROOT/.env"
}
trap restore_env EXIT

restart_stack() {
  "$ROOT/scripts/dev-native.sh" stop >/dev/null 2>&1 || true
  sleep 2
  "$ROOT/scripts/dev-native.sh" >/dev/null 2>&1 &
  for _ in $(seq 1 60); do curl -sf -m 5 "$RESPONDER_URL/health" >/dev/null 2>&1 && break; sleep 2; done
}
restart_stack
curl -sf -m 5 "$RESPONDER_URL/health" >/dev/null || fail "responder did not come back after credits-off restart"

TOKEN=$(sign_in) || fail "re-sign-in failed"
balance=$(curl -sf -m 30 -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/account" | jq -r '.apply_credits')
[[ "$balance" -eq 0 ]] || fail "expected 0 credits with DEMO_AUTO_CREDITS=0, got $balance"

apply_pay=$(curl -s -m 120 -X POST -H "Authorization: Bearer $TOKEN" "$RESPONDER_URL/apply")
if [[ $(echo "$apply_pay" | jq -r '.status // empty') == "pending_approval" ]]; then
  pay_approval=$(echo "$apply_pay" | jq -r '.approval_id')
  apply_pay=$(curl -s -m 300 -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d '{"decision":"approved"}' "$RESPONDER_URL/approvals/$pay_approval")
fi
[[ $(echo "$apply_pay" | jq -r '.error // empty') == "payment_required" ]] \
  || fail "0-credit apply was not paywalled: $apply_pay"
[[ $(pr_count) -eq "$PRS_BEFORE" ]] || fail "a PR appeared for a 0-credit user"
ok "0 credits → 402 payment_required, no PR"

# --- cleanup ------------------------------------------------------------------------
section "cleanup"
restore_env
trap - EXIT
restart_stack
"$ROOT/scripts/reset.sh" >/dev/null
wait_incident ok || fail "sensor not green after cleanup reset"
ok "credits restored, stack restarted, target repo green"

echo ""
echo "NEGATIVE PATHS: all 4 proofs hold (reject / deny / protected-path gate / paywall)"

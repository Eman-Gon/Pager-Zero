# RescueOps++ Demo Runbook

Current setup: **claimflow** patient loaded into `target-repo` (clean, at tag `good`),
`PATIENT_REPO=target-repo`, PRs ship to `Eman-Gon/patient-claimflow`, Mission Control is
the `web/` app on **:5174**.

## Rehearsal (run once, the day before)

```bash
./scripts/dev-native.sh        # starts sensor :3003, responder :3004, Mission Control :5174
./scripts/preflight.sh         # PASS/FAIL for env, services, Neo4j, LLM, Daytona
./scripts/e2e.sh               # full live chain — opens a REAL PR on patient-claimflow
./scripts/reset.sh             # back to green
```

If `e2e.sh` is green, the demo works. Close the PR it opened (or keep it as a backup
artifact to show if the live LLM call misbehaves on stage).

## Demo flow (~5 min)

1. **Start** — `./scripts/dev-native.sh` (opens http://127.0.0.1:5174). Everything green.
2. **Break production** — click *Break production* in the operator console
   (or `./scripts/break.sh`). The sensor commits an off-by-one into
   `sumRiskWeights` and detects it within ~10s: root cause + blast radius
   (`computeRiskScore → decideApproval → processClaim`) from the Neo4j code graph.
3. **Open the chain** — sidebar → *Open chain* (`/incidents/chain`), click **Run full chain**:
   - Detect: confirms root cause from the sensor
   - Diagnose: LLM + graph context + cited runbook (off-by-one runbook)
   - Graph snapshot before fix
   - Verify: candidate patch runs against the real test suite in a Daytona sandbox
     — **this is the slow step, allow 1–3 minutes**; narrate here
   - Graph snapshot after verify
   - Ship: policy gate → (auto-approves if gated) → real GitHub PR + MTTR
4. **Show the PR** — click through to `Eman-Gon/patient-claimflow`.
5. **Restore** — *Restore* button or `./scripts/reset.sh`. Board goes green.

## If something goes wrong on stage

| Symptom | Fix |
| ------- | --- |
| Service down | `./scripts/dev-native.sh status`, logs in `.dev/*.log` |
| Responder 401 | Butterbase service sign-in failed — check `.dev/responder.log` for `auth_service_fallback_failed` |
| Sensor shows no incident after break | It scans on new commits (~5s poll); check `.dev/sensor.log` for `scan_error` |
| Diagnose hangs | LLM/gateway: `curl http://127.0.0.1:3004/connection` |
| Verify fails | Daytona: re-run the step from the chain page; check responder log |
| Anything unrecoverable | `./scripts/reset.sh` + restart stack; fall back to the rehearsal PR |

## Changing patients later

```bash
./scripts/load-patient.sh <name>   # copies patient into target-repo, retags 'good'
# restart the sensor (dev-native.sh restarts everything) — it builds the code graph at startup
# set GITHUB_REPO=Eman-Gon/patient-<name> in .env so the PR lands in the right repo
```

`break.sh` / the UI break button are patient-aware (the sensor picks the scripted
bug matching the loaded source tree).

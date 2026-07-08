# Butterbase in RescueOps++

Butterbase is the product backend (Milestone 5+): auth, persistence, credits/payment, and the AI gateway that serves the diagnosis LLM.

## Architecture

```
frontend (Mission Control) ──JWT──► responder ──Data API──► Butterbase Postgres
                                        │
                                        └── gateway key ──► Butterbase AI Gateway ──► diagnosis LLM
```

| Piece | Location | Role |
| ----- | -------- | ---- |
| Frontend client | `frontend/src/api.ts`, `App.tsx` | Sign-in, Data API reads (approvals, accounts) |
| Responder client | `services/responder/src/butterbase.ts` | Persist incidents/actions, credits, approvals |
| LLM gateway | `services/responder/diagnose.pipe` + `pipeline.ts` | OpenAI-compatible chat for diagnosis |
| App ID | `VITE_BUTTERBASE_APP_ID` / `BUTTERBASE_APP_ID` | Routes requests to your app |

## Required environment variables

Root `.env` (responder / docker-compose):

```env
BUTTERBASE_APP_ID=              # From dashboard.butterbase.ai
BUTTERBASE_API_URL=https://api.butterbase.ai
BUTTERBASE_GATEWAY_URL=https://api.butterbase.ai/v1
BUTTERBASE_API_KEY=             # Personal key with ai:gateway scope
BUTTERBASE_CHAT_MODEL=anthropic/claude-sonnet-4.6
BUTTERBASE_PLAN_CREDITS=5       # Credits granted per subscription activation
```

Frontend (`.env` or Vite defaults in `api.ts`):

```env
VITE_BUTTERBASE_APP_ID=
VITE_BUTTERBASE_API_URL=https://api.butterbase.ai
```

Mint a gateway API key at the dashboard (`POST /api-keys` with `scopes: ["ai:gateway"]`).

## Schema (tables + RLS)

All tables have row-level security — users see only their own rows.

| Table | Key columns | Written by |
| ----- | ----------- | ---------- |
| `incidents` | `root_cause`, `blast_radius` (jsonb), `severity`, `status`, `mttr_seconds` | `recordIncidentAction`, `markApplied` |
| `actions` | `incident_id`, `type`, `candidate_fix` (jsonb), `verified`, `applied` | diagnose/remediate/ship flow |
| `accounts` | `id` (uuid unique), `user_id` (PK), `apply_credits`, `plan` | `ensureAccount`, `spendCredit` |
| `approvals` | `action_id`, `status` (`pending`/`approved`/`denied`) | M7 approval gate |

**Accounts write requirement:** Butterbase Data API writes only support `PATCH /table/:id` (path param on a column literally named `id`). Query-string filters such as `?user_id=eq…` return 404. The `accounts` table therefore needs an `id` column (uuid, unique, `default: gen_random_uuid()`) alongside the existing `user_id` primary key. Add it in the Butterbase dashboard via **Edit schema (JSON)**:

```json
"id": {
  "type": "uuid",
  "nullable": false,
  "default": "gen_random_uuid()",
  "unique": true
}
```

The responder's `writeAccount()` helper updates by `.eq('id', …)` so credit grants, spends, and refunds persist and the UI balance drops (5→4).

**jsonb gotcha:** top-level JS arrays are rejected by jsonb columns — wrap lists in an object:

```typescript
blast_radius: { functions: incident.blast_radius }  // not blast_radius: incident.blast_radius
```

## Auth flow

1. User signs up/in via `butterbase.auth.signUp` / `signIn` (frontend)
2. Frontend passes `Authorization: Bearer <access_token>` to responder endpoints
3. Responder creates a per-request client: `createClient({ appId, apiUrl })` + `setAccessToken(token)`
4. Data API enforces RLS using the JWT `sub` claim as `user_id`

When `BUTTERBASE_APP_ID` is unset, the responder still runs diagnosis/remediation but skips persistence and auth checks.

## Credits and paywall

- Free tier: `apply_credits = 0`
- Active Stripe subscription → `ensureAccount` grants `BUTTERBASE_PLAN_CREDITS` once per plan activation
- `POST /apply` and approved `POST /approvals/:id` call `spendCredit()` — throws `PaywallError` (402) at zero credits
- Frontend `CreditsPanel` opens Stripe checkout via `butterbase.billing.subscribe()`

## AI gateway (M3 + M5)

Diagnosis is a direct OpenAI-compatible `chat/completions` call pointed at the Butterbase gateway:

```
base_url: ${BUTTERBASE_GATEWAY_URL}
apikey:   ${BUTTERBASE_API_KEY}
model:    ${BUTTERBASE_MODEL}
```

The responder assembles the context and issues the call in `services/responder/src/pipeline.ts`.

## Key responder endpoints (auth-gated when configured)

| Endpoint | Butterbase interaction |
| -------- | ---------------------- |
| `POST /diagnose` | `recordIncidentAction` → incidents + actions |
| `POST /remediate` | same + stores `candidate_fix`, `verified` |
| `POST /apply` | `spendCredit` → `markApplied` (after GitHub PR) |
| `POST /approvals/:id` | `setApprovalStatus`; approved path calls `shipVerifiedFix` |
| `POST /apply-stub` | `spendCredit` only (M5 smoke test) |

## Verify Butterbase is working

```bash
# Sign in via Mission Control (or API), then:
curl -X POST http://localhost:3004/diagnose \
  -H "Authorization: Bearer <token>"

# Check rows exist (frontend Approvals/Credits panels, or Data API)
# Free user apply should 402:
curl -X POST http://localhost:3004/apply-stub \
  -H "Authorization: Bearer <token>"
```

## Demo credentials

The frontend auto-logs in when `VITE_AUTO_LOGIN=1` (default):

- Email: `oncall@rescueops.dev`
- Password: `Resc!ue0ps2026`

## Official resources

- Dashboard: https://dashboard.butterbase.ai
- Docs: https://docs.butterbase.ai
- SDK: https://www.npmjs.com/package/@butterbase/sdk
- GitHub: https://github.com/butterbase-ai/butterbase

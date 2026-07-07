# RocketRide in RescueOps++

This project uses **RocketRide Cloud** as the diagnosis brain (Milestone 3). The responder service runs `diagnose.pipe` on Cloud via the TypeScript SDK — it does not run a local RocketRide engine.

## Architecture

```
sensor (/incident) → responder (assemble context) → RocketRide Cloud (diagnose.pipe) → structured Diagnosis JSON
```

| Piece | Location | Role |
| ----- | -------- | ---- |
| Pipeline | `services/responder/diagnose.pipe` | Agent + LLM nodes; returns JSON diagnosis |
| SDK client | `services/responder/src/pipeline.ts` | `RocketRideClient.use()` → `chat()` → parse JSON |
| Connection proof | `GET /connection` on responder `:3004` | Returns `getConnectionInfo().uri` — must be the Cloud host |
| Smoke test | `scripts/phase0-smoke/smoke.mjs` | Verifies Cloud connectivity before building |

## Required environment variables

Set these in the repo root `.env` (see `.env.example`):

```env
ROCKETRIDE_APIKEY=          # From https://rocketride.ai dashboard
ROCKETRIDE_URI=https://api.rocketride.ai
```

The pipeline's LLM node routes through **Butterbase AI Gateway** via `${ROCKETRIDE_*}` substitutions passed in the SDK client `env` block:

```typescript
new RocketRideClient({
  auth: process.env.ROCKETRIDE_APIKEY,
  uri: process.env.ROCKETRIDE_URI ?? 'https://api.rocketride.ai',
  env: {
    ROCKETRIDE_BUTTERBASE_GATEWAY_URL: process.env.BUTTERBASE_GATEWAY_URL,
    ROCKETRIDE_BUTTERBASE_API_KEY: process.env.BUTTERBASE_API_KEY,
    ROCKETRIDE_BUTTERBASE_MODEL: process.env.BUTTERBASE_CHAT_MODEL,
  },
});
```

## The diagnose.pipe pipeline

`diagnose.pipe` is a hand-authored JSON pipeline with five components:

1. **chat** — receives the assembled incident context as a question
2. **agent_rocketride** — on-call engineer agent; must return strict JSON (severity, explanation, candidate_fix)
3. **memory_internal** — agent memory
4. **llm_openai_api** — Butterbase gateway (custom OpenAI-compatible base URL)
5. **response_answers** — returns the agent's answer on the `answers` lane

The responder calls it like this:

```typescript
const { token } = await client.use({ filepath: PIPE_PATH });
const question = new Question({ expectJson: false });
question.addQuestion(context);
const response = await client.chat({ token, question });
await client.terminate(token);
```

`expectJson: false` is intentional — the model sometimes wraps JSON in fences; the responder parses strictly then falls back to loose extraction (including Python-literal dicts from the Cloud answers lane).

## Verify Cloud is working

```bash
# Phase 0 smoke (from repo root, with .env filled in)
cd scripts/phase0-smoke && npm install && node smoke.mjs

# With stack running
curl http://localhost:3004/connection
# → { "connected": true, "transport": "...", "uri": "https://api.rocketride.ai" }

# Seed incident, then diagnose
./scripts/break.sh
curl -X POST http://localhost:3004/diagnose -H "Authorization: Bearer <token>"
```

A successful diagnosis names `computeTax`, explains the wrong-operator bug, and includes a `candidate_fix` with the full corrected `src/tax.ts`.

## Editing the pipeline

- Open `services/responder/diagnose.pipe` in the **RocketRide VS Code extension** for visual editing, or edit the JSON directly.
- Read `.rocketride/docs/ROCKETRIDE_PIPELINE_RULES.md` and `ROCKETRIDE_COMPONENT_REFERENCE.md` before changing nodes.
- After edits, rebuild the responder container: `docker compose build responder && docker compose up -d responder`.

## Official resources

| Resource | URL |
| -------- | --- |
| Docs | https://docs.rocketride.org/ |
| Cloud | https://rocketride.ai |
| TypeScript SDK | https://www.npmjs.com/package/rocketride |
| GitHub | https://github.com/rocketride-org/rocketride-server |
| Discord | https://discord.gg/PMXrtenMsY |

Agent-oriented docs for coding assistants live in this directory (`.rocketride/docs/`).

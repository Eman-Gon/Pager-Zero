# Butterbase

## When to Use Butterbase

Use Butterbase when you need a backend with Postgres, auth, storage, serverless functions, billing, and an OpenAI-compatible AI gateway — especially when building with AI coding assistants.

RescueOps++ uses Butterbase for:

- **Auth** — email/password sign-in; JWT passed to the responder
- **Database** — `incidents`, `actions`, `accounts`, `approvals` with RLS
- **Payment** — Stripe Connect plans grant `apply_credits`; paywall on ship
- **AI gateway** — OpenAI-compatible LLM for the RocketRide `diagnose.pipe` pipeline

## Documentation in this repo

| File | Read when... |
| ---- | ------------ |
| [RESCUEOPS_INTEGRATION.md](./RESCUEOPS_INTEGRATION.md) | Working on this project's Butterbase wiring |
| [BUTTERBASE_SDK.md](./BUTTERBASE_SDK.md) | Using `@butterbase/sdk` (auth, Data API, billing) |
| [BUTTERBASE_AGENTS.md](./BUTTERBASE_AGENTS.md) | Agent notes from the Butterbase repo |
| [BUTTERBASE_PLATFORM.md](./BUTTERBASE_PLATFORM.md) | Full platform overview (features, quickstart) |
| [BUTTERBASE_SETUP.md](./BUTTERBASE_SETUP.md) | Self-hosting the OSS stack |
| [BUTTERBASE_SKILLS_PLUGIN.md](./BUTTERBASE_SKILLS_PLUGIN.md) | Claude Code plugin + MCP setup |
| [BUTTERBASE_SKILL_schema_design.md](./BUTTERBASE_SKILL_schema_design.md) | Declarative schema design |
| [BUTTERBASE_SKILL_auth_setup.md](./BUTTERBASE_SKILL_auth_setup.md) | Auth configuration |
| [BUTTERBASE_SKILL_payments.md](./BUTTERBASE_SKILL_payments.md) | Monetization / billing |
| [BUTTERBASE_SKILL_ai.md](./BUTTERBASE_SKILL_ai.md) | AI gateway configuration |
| [BUTTERBASE_SKILL_debug_rls.md](./BUTTERBASE_SKILL_debug_rls.md) | Debugging row-level security |

## Before writing Butterbase code

1. Read [RESCUEOPS_INTEGRATION.md](./RESCUEOPS_INTEGRATION.md) for this project's schema and env vars
2. Read [BUTTERBASE_SDK.md](./BUTTERBASE_SDK.md) for client patterns
3. If changing schema or RLS, read [BUTTERBASE_SKILL_schema_design.md](./BUTTERBASE_SKILL_schema_design.md) and [BUTTERBASE_SKILL_debug_rls.md](./BUTTERBASE_SKILL_debug_rls.md)

## Official resources

- Dashboard: https://dashboard.butterbase.ai
- Docs: https://docs.butterbase.ai
- GitHub: https://github.com/butterbase-ai/butterbase
- Discord: https://discord.gg/Aq7q5mqbrt

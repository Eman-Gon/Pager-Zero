---
description: Use when working with Butterbase auth, schema, Data API, billing, or AI gateway
globs: ['**/*butterbase*', '**/butterbase.ts', 'frontend/src/api.ts', 'frontend/src/panels/CreditsPanel.tsx']
---

<!-- BUTTERBASE:BEGIN -->

# Butterbase: AI-native Backend

Use Butterbase for auth, Postgres persistence, RLS, billing/credits, and the OpenAI-compatible AI gateway.

## Documentation

Full docs: `.butterbase/docs/`

**Read the relevant doc(s) before generating any Butterbase code.**

| File | Read when... |
| ---- | ------------ |
| BUTTERBASE_README.md | Starting any Butterbase work: overview + doc index |
| RESCUEOPS_INTEGRATION.md | This project's schema, env vars, and responder wiring |
| BUTTERBASE_SDK.md | `@butterbase/sdk` client methods (auth, Data API, billing) |
| BUTTERBASE_SKILL_schema_design.md | Declarative schema or table changes |
| BUTTERBASE_SKILL_auth_setup.md | Auth configuration |
| BUTTERBASE_SKILL_payments.md | Monetization / Stripe plans |
| BUTTERBASE_SKILL_ai.md | AI gateway setup |
| BUTTERBASE_SKILL_debug_rls.md | RLS policy debugging |

## Before Writing ANY Butterbase Code

1. Read `.butterbase/docs/RESCUEOPS_INTEGRATION.md` for this project's tables and env vars
2. Read `.butterbase/docs/BUTTERBASE_SDK.md` for client patterns
3. If changing schema or RLS, read the schema-design and debug-rls skill docs
<!-- BUTTERBASE:END -->

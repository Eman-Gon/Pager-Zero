---
description: Use when working with external incident sources — PagerDuty / Sentry inbound webhooks, alert correlation, or resolve-on-ship
globs: ['**/pagerduty.ts', '**/sentry.ts', '**/external-incidents.ts', '**/autonomous.ts', '**/services/responder/src/index.ts']
---

<!-- INCIDENT-SOURCES:BEGIN -->

# Incident Sources: PagerDuty + Sentry

Bring real alerts into RescueOps++ and close them out. Both are **opt-in,
env-flagged, additive** — default off, the baseline sensor/autonomous flow is
unchanged. They live in the **responder** service (no vendored SDK/docs tree; the
integration is plain `fetch` against each provider's HTTP API).

## What each does

- **PagerDuty** — an inbound V3 webhook `incident.triggered` triggers the headless
  diagnose→remediate→apply chain; on ship the page is **auto-resolved** via the
  REST API with a note linking the PR + MTTR.
- **Sentry** — an inbound error webhook triggers the chain AND its stack trace
  **seeds/confirms the root-cause function** and is appended to the diagnosis
  context; on ship the issue is resolved.

## Code map

| File | Responsibility |
| ---- | -------------- |
| `services/responder/src/pagerduty.ts` | signature verify, `parsePagerDutyTrigger`, `resolvePagerDutyIncident` (REST API) |
| `services/responder/src/sentry.ts` | signature verify, `parseSentryEvent` (stack-frame extraction), enrichment stash, `resolveSentryIssue` |
| `services/responder/src/external-incidents.ts` | in-process map: correlate an alert to its incident by `root_cause` for resolve-on-ship |
| `services/responder/src/autonomous.ts` | `driveServiceChain()` / `serviceAccountReady()` — the shared headless chain, reused by the webhooks |
| `services/responder/src/index.ts` | `POST /webhooks/pagerduty`, `POST /webhooks/sentry`, raw-body parser, resolve hook in `shipVerifiedFix`, `/health` tools |

## Key wiring facts (read before changing)

1. **Resolve uses the REST API, not Events API.** An inbound webhook references a
   PagerDuty incident by **id**; the Events API routing key only resolves alerts
   you triggered yourself. Resolve = `PUT https://api.pagerduty.com/incidents/{id}`
   with `Token token=…` + a `From` user email.
2. **Signatures are verified over the RAW body.** `index.ts` installs a JSON
   content-type parser that stashes `request.rawBody` while still parsing
   `request.body`. HMAC-SHA256: PagerDuty `X-PagerDuty-Signature: v1=…`, Sentry
   `Sentry-Hook-Signature`. **No secret set → verification skipped** (local/demo).
3. **The chain needs the service account.** Webhooks call `serviceAccountReady()`
   (Butterbase + `SERVICE_PASSWORD`); return `503` when unconfigured. Everything
   still flows through the policy gate, paywall, and RLS — risky fixes park as
   pending approvals, and the resolve fires from `shipVerifiedFix` (the single ship
   choke point) so both auto and approved ships resolve exactly once.
4. **Correlation key is `root_cause`.** `registerExternal(root_cause, refs)` at
   trigger time; `takeExternal(root_cause)` in `shipVerifiedFix`.
5. **Sentry enrichment is consume-once** via `stashSentryEnrichment` /
   `takeSentryEnrichment`, picked up inside `runDiagnosis`.

## Env vars (`.env.example`)

`PAGERDUTY_ENABLED`, `PAGERDUTY_WEBHOOK_SECRET`, `PAGERDUTY_API_TOKEN`,
`PAGERDUTY_FROM_EMAIL`; `SENTRY_ENABLED`, `SENTRY_WEBHOOK_SECRET`,
`SENTRY_AUTH_TOKEN`. Real webhooks require the responder to be publicly reachable
(ngrok / tunnel — see `.dev/ngrok.yml`).
<!-- INCIDENT-SOURCES:END -->

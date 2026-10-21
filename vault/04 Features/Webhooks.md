---
type: feature
status: shipped
engine: [any]
tier: both
endpoints: 5
tags: [feature, api, security, webhooks]
updated: 2026-09-14
source: src/core/webhook-delivery.ts, src/api/webhooks.routes.ts, src/common/security/
---

# 🪝 Webhooks

When something happens in WhatsApp, BunWa can POST (or GET) a JSON payload to your endpoint. This is
the most security-hardened subsystem in the codebase.

## Subscription model

Webhooks live **inside each session's config**, so they persist in `.sessions-index.json` and move
with the session ([[Data and Storage]]).

```ts
SessionConfig.webhooks[] = {
  id: 'wh_…',
  enabled: boolean,
  method: 'POST' | 'GET',
  url: string,
  events: WAHAEvents[] | ['*'],     // '*' expands to every event
  hmac: { key: string },
  retries: { attempts, delaySeconds, policy },   // policy: exponential | linear | constant
  customHeaders: [{ name, value }],
  filters: { … }                    // see below
}
```

Two layers of subscription:

- **Global** — `WAHA_WEBHOOK_URL` receives `session.status`, `message`, `message.any` for every session
  (`subscribeGlobalWebhooks`).
- **Per session** — the `webhooks[]` array, re-synced whenever settings are saved
  (`resyncWebhooks`; commit `a8097da` fixed webhooks silently detaching after a settings save).

### Managing them

| Endpoint | Notes |
|---|---|
| `GET · POST /api/sessions/:session/webhooks` | list / create (Zod-validated) |
| `PUT · DELETE /api/sessions/:session/webhooks/:id` | |
| `POST /api/sessions/:session/webhooks/:id/test` | performs a **real** delivery attempt; returns 422 on failure |

## Delivery pipeline

```text
event emitted
  → evaluateFilters()            AND-logic over message fields
  → isSsrfProtectionEnabled()?   → resolveSafeFetchTarget()  (DNS + CIDR/IP checks)
  → resolveAndPinFetch()         → follows ≤5 redirects, each re-validated
  → fetch with AbortSignal.timeout(10_000)
  → success? audit WEBHOOK_TRIGGERED : retry / audit WEBHOOK_FAILED
```

### Headers sent

```text
X-WAHA-Event              event name
X-WAHA-Session            session name
X-WAHA-Timestamp          ISO timestamp
X-WAHA-Delivery-Id        unique per attempt (stable across retries)
X-WAHA-Idempotency-Key    sha256(event:session:data) first 32 hex — stable per event
X-WAHA-Retry-Count        attempt number
X-WAHA-Signature          HMAC-SHA256 hex, only when hmac.key is set
```

Custom headers are allowed, except names starting with `X-WAHA-` and `Content-Type`.

### Retries

Only **5xx responses** and **network errors** are retried (a 4xx is treated as your endpoint's final
answer). The wait between attempts follows `retries.policy` (`retryDelay()` in
`src/core/webhook-delivery.ts`), plus 0–100 ms of jitter:

```text
exponential (default)  2^attempt × delay  → 2 s, 4 s, 8 s
linear                 (attempt+1) × delay → 2 s, 4 s, 6 s
constant               delay               → 2 s, 2 s, 2 s
defaults: attempts = 3, delaySeconds = 2; attempts = 0 means one try, no retry
```

Each attempt has a 10 s timeout. `GET` subscriptions receive the payload as `?payload=<json>` and
still carry the `X-WAHA-*` headers, the signature and custom headers (only `Content-Type` is dropped).

### HMAC signing

HMAC-SHA256 over the raw body, hex-encoded (`src/common/security/webhook-signing.ts`), with a
timing-safe verify helper you can reuse server-side. The same module powers Chatwoot webhook
verification and the idempotency key.

### Filters

`evaluateFilters()` (`src/common/security/webhook-filters.ts`) supports AND-composed conditions on
sender, recipient, body, type, `isGroup`, `fromMe`, `hasMedia` and `mentions`, with JID
normalisation via `wa-id.ts`. Guard rails: max 20 conditions, 100 values, 1000 chars.
Only `message*` events are filtered; other events always pass.

How each field is read from a message (the payloads carry no `isGroup` or `author` on NOWEB):

| Field | Read from |
|---|---|
| sender | `author` (WEBJS group) → `participant` (NOWEB group) → `from`; a list or a comma-separated string; `+233 55 …` style numbers are accepted |
| isGroup | the chat id ends in `@g.us` (`to` for messages you sent, `from` otherwise) |
| hasMedia | `hasMedia`, or a downloaded `media` |
| fromMe | `fromMe` |
| body | case-insensitive `contains` / `equals` |

Senders addressed by a private LID (`…@lid`) are mapped to their phone number before the check
(`buildLidResolver()` in `src/core/webhook-lid-resolver.ts`): first from the phone the message key
carries (`remoteJidAlt` / `participantAlt`), then from the session's LID store. The lookup only runs
when a sender, recipient or mentions filter is set.

## SSRF protection

`src/common/security/ssrf-guard.ts` runs before every outbound request:

- DNS resolution with a 10 s deadline, then checks against IPv4 CIDR and IPv6 blocklists
  (including v4-mapped, 6to4 and NAT64 forms).
- Manual redirect handling (`resolveAndPinFetch`) — max 5 hops, each hop re-validated, so a
  redirect can't smuggle you to `169.254.169.254`.
- `SSRF_ALLOWED_HOSTS` allow-list for legitimate internal endpoints.
- `WEBHOOK_SSRF_PROTECT=false` disables it (documented as unsafe).
- The same guard protects `fetchBuffer` for remote media/`file://`-style inputs
  (commit `f76de62`).

## Observability

Every delivery outcome is audited — success with `statusCode` + `deliveryId`, failure with the error
([[Audit Log]]). Failures are logged by pino with the target URL.

## Related

[[Audit Log]] · [[Security Model]] · [[WebSocket Events]] · [[Configuration Reference]] · [[Dashboard]]

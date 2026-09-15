---
type: feature
status: shipped
engine: [any]
tier: both
endpoints: 1
tags: [feature, ops, security]
updated: 2026-09-14
source: src/core/audit/audit.service.ts, src/api/audit.routes.ts
---

# 📝 Audit Log

A structured, queryable record of everything security- or lifecycle-relevant: session start/stop,
message sends and failures, webhook deliveries, and **auth failures**.

## Storage

- Engine: **`bun:sqlite`** at `${WAHA_STORAGE_DIR or ./data}/audit.db`, **WAL** mode.
- The directory is auto-created by `AuditService` (this is the fresh-clone boot fix; without it the
  first run died with `SQLITE_CANTOPEN`).

### Schema — `audit_logs`

| Column | Notes |
|---|---|
| `id` | Primary key — **UUIDv7**, so ids are time-ordered and new rows append to the right edge of the PK B-tree instead of scattering ([[Bun Runtime Adoption]]) |
| `action` | action enum (`api_key_*`, `session_*`, `message_*`, `webhook_*`, …) |
| `severity` | `info` (default) · `warn` · `error` |
| `apiKeyId`, `apiKeyName` | which credential acted |
| `sessionId`, `sessionName` | which session |
| `ipAddress`, `userAgent` | caller identity |
| `method`, `path`, `statusCode` | HTTP context |
| `metadata` | JSON string — per-action extras |
| `errorMessage` | failure detail |
| `createdAt` | ISO timestamp |

Indexes: `idx_audit_action`, `idx_audit_session`, `idx_audit_apikey`, `idx_audit_created`.

## Querying

`GET /api/audit` — filters: `action`, `apiKeyId`, `sessionId`, `severity`, date range; pagination via
`limit` / `offset`. Requires a server-level (admin) credential (`CanServer`).
The dashboard's **Logs** page consumes it, with filters and CSV export ([[Dashboard]]).

## Retention

```text
AUDIT_RETENTION_DAYS = 90   (default)
  ≤ 0  → retention disabled, rows kept forever
```

Cleanup runs **at startup and every 24 h**; the timer and DB handle are torn down in `destroy()` so
tests and shutdown stay clean.

## Where writes come from

| Source | Examples |
|---|---|
| Auth middleware | failed API-key attempts (with IP + user agent) |
| Session manager | `QR_GENERATED`, `CONNECTED`, `DISCONNECTED`, `SESSION_DELETED`, `SESSION_FORCE_KILLED` |
| Webhook delivery | `WEBHOOK_TRIGGERED` (with status + delivery id), `WEBHOOK_FAILED` |
| Messaging | send failures |

## Why it exists

It is one of the fork's additions over upstream OpenWA — the thing you want when a client asks
"who deleted that session?" or "was that webhook delivered?". Paired with
[[Webhooks|HMAC signing]] it gives you both sides of an integration trail.

## Related

[[Security Model]] · [[Webhooks]] · [[Data and Storage]] · [[Dashboard]] · [[Configuration Reference]]

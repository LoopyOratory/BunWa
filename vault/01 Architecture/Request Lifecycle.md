---
type: note
section: architecture
tags: [bunwa, architecture, api, security]
updated: 2026-09-14
source: src/main.ts, src/middleware/*
---

# 🔀 Request Lifecycle

Every HTTP request walks the same chain. Knowing the order matters: a route-level policy check
runs *after* global auth, and the session resolver runs *after* both.

## The chain

```text
Bun.serve
  │
  ├─ /ws  ────────────────► Bun WebSocket upgrade (handled before Hono)
  │
  └─ Hono app.fetch
       1. logger()                        — request logging (pino)
       2. cors()                          — WAHA_CORS_ORIGIN; wildcard unless an explicit origin is set
       3. rateLimit() on /api/*           — 200 req/min per client IP
       4. body-size guard on /api/*       — 413 above 10 MB
       5. onError(globalErrorHandler)     — maps exceptions → HTTP, hides 500 detail
       6. [router] apiKeyAuthMiddleware() — x-api-key or dashboard Basic credentials
       7. [route]  policiesMiddleware()   — CanServer / CanSession checks
       8. [route]  workingSessionResolver() or getSessionFromBody()
       9. handler
```

Files: `src/middleware/rate-limit.ts`, `basic-auth.ts`, `api-key-auth.ts`, `policies.ts`,
`session-resolver.ts`, `error-handler.ts`, `get-session-from-body.ts`.

## Stage notes

### 1–2. Logging and CORS

`logger()` is applied to `*`. CORS is permissive (`*`, no credentials) by default; setting
`WAHA_CORS_ORIGIN` to one or more comma-separated origins switches to credentialed CORS for
exactly those origins. Exposed headers include `X-RateLimit-*` and `Retry-After`.

### 3. Rate limiting

In-memory sliding window, 200 requests / 60 s, on `/api/*` only (so `/mcp`, `/ws`, `/ping` and the
dashboard are not limited here — MCP has its own limiter, see [[MCP Server]]). The client IP comes
from the TCP socket unless `TRUSTED_PROXIES` is set, in which case `x-forwarded-for` is honoured.

### 4. Body cap

Requests with `Content-Length > 10 MB` are rejected with `413 {"statusCode":413,...}` before routing.
Note this is a header check — chunked uploads without a length header pass this guard.

### 5. Error handling

`globalErrorHandler` maps exception classes to status codes (404 / 403 / 401 / 400 / 422) and
replaces any 500 body with a generic message, logging the real error. Domain exceptions live in
`src/core/exceptions.ts` — including `AvailableInPlusVersion` / `AvailableInPlusVersionAll`, which
are how Plus gating surfaces ([[Plus Tier]]).

### 6. Authentication

`apiKeyAuthMiddleware` (`src/middleware/api-key-auth.ts`) accepts **either**:

- `X-Api-Key: <WAHA_API_KEY>` (timing-safe compare), **or**
- `Authorization: Basic <dashboard user:pass>` — dashboard credentials are also admin-equivalent.

It sets `c.get('user') = { isAdmin: true }` on success and writes failures to the audit log
([[Audit Log]]). Three escapes exist:

| Escape | Effect |
|---|---|
| `WHATSAPP_API_KEY_EXCLUDE_PATH` | comma-separated path list that skips auth entirely |
| no `WAHA_API_KEY` configured | requests are allowed **unless** `WAHA_ALLOW_NO_AUTH=false` |
| `/ping`, `/health`, `/api/version` | public by design (their routers never install the middleware) |

### 7. Policies

`policiesMiddleware(...)` runs CASL-style checks built by hand (`src/middleware/policies.ts`):
`CanServer(action)` is admin-only; `CanSession(action, FromParam('session'))` allows admins and the
session's owner. Actions come from an `Action` enum (`manage`, `list`, `retrieve`, `create`,
`delete`, `setting`, `control`, `app`, `read`, `send`). Value extractors: `FromParam`, `FromBody`,
`FromQuery`.

### 8. Session resolution

Two strategies, both opt-in per route:

- `workingSessionResolver()` — reads `:session` from the path, loads it via the manager and stores it
  on the context; unknown names produce a 404 (`Session <name> not found`).
- `getSessionFromBody()` — for routes that take the session inside the JSON body
  (used by `chatting.routes.ts` and `contacts.routes.ts`).

> The non-working variant `sessionResolver()` also exists but is unused.

## Middleware that exists but is not applied

- `src/middleware/validation.ts` — `validateBody` / `validateQuery` helpers are defined and never used;
  webhooks use Zod schemas directly, MCP tools validate with Zod too. Most other routes parse
  `c.req.json()` by hand.

## Related

[[REST API]] · [[Security Model]] · [[API Docs]] · [[Health and Observability]]

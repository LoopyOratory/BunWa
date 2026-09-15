---
type: note
section: architecture
tags: [bunwa, architecture, runtime]
updated: 2026-09-14
source: src/main.ts, src/version.ts, src/core/manager.core.ts, src/core/shutdown.service.ts
---

# 🏗️ System Overview

BunWa is a **single Bun process** that serves four things at once: the WAHA-compatible REST API,
a WebSocket event stream, an MCP server, and the compiled React dashboard. WhatsApp connections
are held in-process by an engine per session.

## Runtime facts

| Item | Value |
|---|---|
| Entry point | `src/main.ts` → `bootstrap()` |
| Runtime | Bun ≥ 1.4.0 (`engines.bun`); `bunfig.toml` sets `linker = "isolated"`, `globalStore = true` |
| HTTP framework | Hono 4.x, mounted onto `Bun.serve` |
| Default port | `PORT` → `WHATSAPP_API_PORT` → **3000** in scripts/docs (dev script advertises 3001) |
| Tier detection | `getWAHAVersion()` in `src/version.ts`: `WAHA_VERSION=CORE` forces CORE, otherwise the presence of `src/plus/` ⇒ **PLUS** (and the final fallback is also PLUS) |
| Build output | `bun build src/main.ts --outdir dist --target bun`; the frontend builds separately into `frontend-dist/`. Production runs `src/main.ts` directly, not the bundle |
| Bun-native APIs in use | `Bun.serve` (with `maxRequestBodySize`, WS `perMessageDeflate`), `Bun.file`/`Bun.write`, `Bun.CryptoHasher`, `Bun.gzipSync`/`gunzipSync`, `Bun.S3Client`, `Bun.randomUUIDv7`, `Bun.sleep`, `bun:sqlite` — see [[Bun Runtime Adoption]] |

## Boot sequence

`bootstrap()` in `src/main.ts` runs these steps in order:

1. **DI container** — `configureContainer()` registers service instances with tsyringe ([[Dependency Injection]]).
2. **Config + singletons** — `WhatsappConfigService`, `DashboardConfigServiceCore`, `SwaggerConfigServiceCore`, `SessionManager`; the manager is handed to the WebSocket handler via `setSessionManager()`.
3. **Auth sanity warning** — if `WAHA_ALLOW_NO_AUTH=false` and no `WAHA_API_KEY`, log a loud warning (everything will 401).
4. **Session restore** — `restoreSessions()` reads `.sessions-index.json`, marks sessions stopped; then `startPredefinedSessions()` starts what `WHATSAPP_START_SESSION` / `WHATSAPP_RESTART_ALL_SESSIONS` / per-session `autoStart` asks for ([[Data and Storage]]).
5. **Middleware** — `logger()` on `*`, CORS from `WAHA_CORS_ORIGIN`, per-IP rate limit on `/api/*`, 10 MB body cap on `/api/*`, `app.onError(globalErrorHandler)` ([[Request Lifecycle]]).
6. **Docs** — `/api-docs` (raw OpenAPI JSON) and `/api-docs/` (Scalar UI), optionally Basic-auth protected ([[API Docs]]).
7. **Login endpoint** — `GET /api/dashboard/login`, rate-limited to 10/min, timing-safe compare against dashboard credentials.
8. **Dashboard static** — `frontend-dist/` served at `/` with an SPA fallback; an optional "official" dashboard can be mounted at `/dashboard` behind Basic auth.
9. **Routers** — `createApiRouter()` at `/`, Chatwoot webhook at `/webhook/chatwoot`, MCP at `/mcp`.
10. **`Bun.serve`** — `/ws` upgrades are handled natively *before* Hono sees the request; everything else goes to `app.fetch`.

## Layering

```text
api/            Hono routers — thin, one module per domain, validation + mapping
middleware/     auth · policies · rate limit · error handling · session resolver
core/           SessionManager, session base class, webhook delivery, audit,
                media, templates, bulk send, shutdown, config services
core/engines/   noweb (Baileys) · webjs (Puppeteer) · gows + waproto (stubs)
core/storage/   store abstractions — bun:sqlite, sql, sqlite3, postgres
apps/           Chatwoot integration (+ an empty app-SDK placeholder)
mcp/            MCP server, tool registry and the 43 tool descriptors
plus/           Plus-tier overrides: engine, S3 media, (unwired) PG/Mongo auth repos
structures/     DTOs, enums, config schemas
```

## Session lifecycle

Statuses come from `WAHASessionStatus` in `src/structures/enums.dto.ts`:

```text
STOPPED ──start──► STARTING ──qr──► SCAN_QR_CODE ──auth──► WORKING
                       │                                    │
                       └──────failure────────► FAILED ◄──────┘ (disconnect)
```

- `SessionManager` (`src/core/manager.core.ts`) keeps two maps — live sessions and configs —
  and serialises per-session work with an `AsyncLock` (5 s acquire / 30 s execute).
- Lifecycle verbs: `start`, `stop`, `restart` (silent stop + start), `logout` (engine logout then delete),
  `unpair` (logout, audit `SESSION_FORCE_KILLED`, delete), `delete`, `upsert`.
- **Session names** are validated in `upsert`: ≤ 64 chars, no `/ \ : * ? " < > | .`, no whitespace, not `.`/`..`.
- **Engine selection** is per session in `getEngine()`: `WEBJS` → `session.webjs.core` (Chrome binary pre-checked, start fails if absent);
  otherwise PLUS tier → `src/plus/session.noweb.plus`; else `WhatsappSessionNoWebCore`. `WPP`/`GOWS` fall through to NOWEB.
- Audit transitions are wired into `_start`: `QR_GENERATED` on `SCAN_QR_CODE`, `CONNECTED` on `WORKING`,
  `DISCONNECTED` after a session that was `WORKING`.

## Event fan-out

The base session class exposes RxJS-style observables; the manager subscribes per session and
re-emits through `getSessionEvent(session, event)` / `getSessionEvents(session, events)`, which
both the WebSocket handler ([[WebSocket Events]]), webhook delivery ([[Webhooks]]) and the
Chatwoot app consume. See `src/utils/events.ts` for wildcard unmasking.

## Shutdown

`src/core/shutdown.service.ts` implements a drain: the readiness probe starts returning **503**
so a load balancer stops routing, then sessions are stopped and the process closes. The
`/api/infra/restart` and `/api/server/stop` routes simply `process.exit(0)` and rely on a
supervisor to bring the process back ([[Health and Observability]]).

## Related

[[Request Lifecycle]] · [[Directory Map]] · [[Engines Overview]] · [[Data and Storage]] · [[Configuration Reference]]

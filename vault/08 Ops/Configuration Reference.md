---
type: note
section: ops
tags: [bunwa, ops, config, reference]
updated: 2026-09-14
source: .env.example, src/config.service.ts, src/core/env.ts, grep of process.env
status: shipped
---

# ⚙️ Configuration Reference

Everything is environment-driven; `.env` is read at boot and `PUT /api/infra/config` can rewrite it
(preserving comments and order) then mirrors changes into `process.env`.

**Wired** column: ✅ = consumed by the runtime · ⚠️ = present in `.env.example`/config service but
**no consumer** · 🖥️ = dashboard/infra display only.

## Server

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `PORT` | 3000 | HTTP port (takes precedence) | ✅ |
| `WHATSAPP_API_PORT` | 3000 | fallback port | ✅ |
| `WHATSAPP_API_SCHEMA` | http | scheme used in generated URLs | ✅ |
| `WHATSAPP_API_HOSTNAME` | localhost | hostname used in generated URLs | ✅ |
| `WAHA_BASE_URL` | — | override the computed base URL (media links) | ✅ |
| `WAHA_CORS_ORIGIN` | — | comma-separated origins; enables credentialed CORS | ✅ |
| `TRUSTED_PROXIES` | — | trust `x-forwarded-for` from these IPs | ✅ |

## Authentication & dashboard

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WAHA_API_KEY` | — | API key (`X-Api-Key`); unset = open API | ✅ |
| `WAHA_ALLOW_NO_AUTH` | true | when `false`, requests without a key are rejected | ✅ |
| `WHATSAPP_API_KEY_EXCLUDE_PATH` | — | comma-separated paths exempt from auth | ✅ |
| `WAHA_DASHBOARD_ENABLED` | true | serve the dashboard | ✅ |
| `WAHA_DASHBOARD_USERNAME` / `_PASSWORD` | admin / admin | dashboard Basic auth — **also admin for the API** | ✅ |
| `WHATSAPP_SWAGGER_ENABLED` | true | `/api-docs` | ✅ |
| `WHATSAPP_SWAGGER_USERNAME` / `_PASSWORD` | — | Basic auth for `/api-docs` (optional) | ✅ |
| `WHATSAPP_SWAGGER_TITLE` / `_DESCRIPTION` / `_EXTERNAL_DOC_URL` / `_CONFIG_ADVANCED` | — | docs page metadata | ✅ |

## Logging

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WAHA_LOG_LEVEL` | info | trace…fatal; `debug` enables `pino-pretty` | ✅ |
| `WAHA_LOG_FORMAT` | PRETTY | pretty vs JSON | ✅ |
| `WAHA_HTTP_LOG_LEVEL` | info | request log verbosity | ✅ |
| `DEBUG` | — | `1` → verbose Baileys output | ✅ (library) |
| `WAHA_DEBUG_MODE` | false | extra diagnostics | ✅ |

## Engine & sessions

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WHATSAPP_DEFAULT_ENGINE` | NOWEB | default engine (`NOWEB`/`WEBJS`) | ✅ |
| `ENGINE_TYPE` | — | alternative override | ⚠️ |
| `WAHA_NAMESPACE` / `WAHA_SESSION_NAMESPACE` | engine name | session name prefixing | ✅ |
| `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH` | — | Chrome binary for WEBJS | ✅ |
| `WAHA_PRINT_QR` | true | print QR in console | ✅ |
| `WAHA_CLIENT_DEVICE_NAME` / `_BROWSER_NAME` | — | spoofed device/browser (NOWEB) | ✅ |
| `WHATSAPP_START_SESSION` | — | comma-separated sessions to auto-start | ✅ |
| `WHATSAPP_RESTART_ALL_SESSIONS` | false | restore + start everything on boot | ✅ |
| `WAHA_AUTO_START_DELAY_SECONDS` | 0 | delay before auto-start | ✅ |
| `WAHA_WORKER_ID` | — | worker identity in `/api/workers` | ✅ |
| `WAHA_WORKER_RESTART_SESSIONS` | true | worker restores sessions | ✅ |
| `WAHA_VERSION` | auto | `CORE` forces Core; otherwise `src/plus` ⇒ PLUS | ✅ |

## Presence & chat filtering

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WAHA_PRESENCE_AUTO_ONLINE` | true | mark online on activity | ✅ |
| `WAHA_PRESENCE_AUTO_ONLINE_DURATION_SECONDS` | 25 | keep-online window | ✅ |
| `WAHA_SESSION_CONFIG_IGNORE_STATUS` | false | ignore status messages on load | ✅ |
| `WAHA_SESSION_CONFIG_IGNORE_GROUPS` | false | ignore group chats | ✅ |
| `WAHA_SESSION_CONFIG_IGNORE_CHANNELS` | false | ignore channels | ✅ |
| `WAHA_SESSION_CONFIG_IGNORE_BROADCAST` | false | ignore broadcast lists | ✅ |

## Two database switches

> **The single most confusing thing in this config surface** — two sets of variables describe "the
> database", and only one of them is real at runtime.

| Set | Consumed by | Effect |
|---|---|---|
| `WAHA_DATABASE_DRIVER` + `WAHA_DATABASE_URL` / `WHATSAPP_SESSIONS_POSTGRESQL_URL` | the **runtime** (NOWEB store factory) | actually chooses SQLite vs Postgres for session data |
| `WAHA_DB_TYPE` + `WAHA_DB_HOST/PORT/USERNAME/NAME/SSL` | the **dashboard only** (`/api/infra/config`, Infrastructure page) | written to `.env` and displayed; nothing reads them at runtime |

So flipping "Postgres" on the Infrastructure page does not move your session storage. Set
`WAHA_DATABASE_DRIVER=postgres` **and** `WAHA_DATABASE_URL` for that. Details:
[[Data and Storage#Database switches — ⚠️ two of them]].

## Database & storage

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WAHA_DATABASE_DRIVER` | sqlite | **the real switch** — `sqlite` or `postgres` | ✅ |
| `WAHA_DATABASE_URL` | — | Postgres connection string | ✅ |
| `WHATSAPP_SESSIONS_POSTGRESQL_URL` | — | alias for the above | ✅ |
| `WHATSAPP_SESSIONS_MONGO_URL` | — | getter exists, unused | ⚠️ |
| `WAHA_SQLITE_PATH` | .sessions/waha.db | getter exists, unused | ⚠️ |
| `WAHA_DB_TYPE` + `WAHA_DB_HOST/PORT/USERNAME/NAME/SSL` | sqlite | **dashboard display + `.env` persistence only** | 🖥️ |
| `WAHA_LOCAL_STORE_BASE_DIR` | .sessions | session auth data root | ✅ |
| `WAHA_STORAGE_DIR` | ./data | audit + templates databases | ✅ |
| `DATA_DIR` | ./data | export/import service (unwired) | ⚠️ |
| `AUDIT_RETENTION_DAYS` | 90 | audit retention; ≤0 disables | ✅ |
| `EXPORT_IMPORT_MAX_BACKUPS` | — | unwired | ⚠️ |
| `STORAGE_IMPORT_MAX_BYTES` / `_ENTRIES` | 200 MiB / 100 000 | unwired storage service | ⚠️ |

## Media

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WAHA_STORAGE_TYPE` | local | `local` or `s3` | ✅ |
| `WAHA_STORAGE_LOCAL_PATH` / `STORAGE_LOCAL_PATH` | /tmp/whatsapp-files | local media folder | ✅ |
| `WHATSAPP_FILES_FOLDER` | /tmp/whatsapp-files | alternative local path | ✅ |
| `WHATSAPP_DOWNLOAD_MEDIA` | true | auto-download inbound media | ✅ |
| `WHATSAPP_FILES_MIMETYPES` | — (all) | comma-separated MIME allow-list | ✅ |
| `WAHA_S3_ENDPOINT` / `_BUCKET` / `_REGION` / `_ACCESS_KEY` / `_SECRET_KEY` | — | S3 media storage | ✅ |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (+ `S3_ACCESS_KEY`/`S3_SECRET_KEY` aliases) | — | canonical names for the same values | ✅ |
| `WHATSAPP_HEALTH_MEDIA_FILES_THRESHOLD_MB` / `_SESSION_FILES_THRESHOLD_MB` | 100 | health thresholds | ✅ |
| `WHATSAPP_HEALTH_MONGO_TIMEOUT_MS` | 3000 | Mongo health timeout | ✅ |

## Webhook

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `WAHA_WEBHOOK_URL` | — | global webhook for every session | ✅ |
| `WEBHOOK_SSRF_PROTECT` | true | set `false` to allow internal targets (unsafe) | ✅ |
| `SSRF_ALLOWED_HOSTS` | — | allow-list under SSRF protection | ✅ |

## Proxy — ⚠️ not wired

| Variable | Purpose | Wired |
|---|---|---|
| `WHATSAPP_PROXY_SERVER` | single proxy for all sessions | ⚠️ |
| `WHATSAPP_PROXY_SERVER_LIST` | comma-separated pool | ⚠️ |
| `WHATSAPP_PROXY_SERVER_INDEX_PREFIX` | session→proxy mapping prefix | ⚠️ |
| `WHATSAPP_PROXY_SERVER_USERNAME` / `_PASSWORD` | proxy credentials | ⚠️ |

Configure proxies per session instead — [[Proxy Support]].

## Queue / Redis — ⚠️ not wired

`WAHA_QUEUE_ENABLED`, `WAHA_REDIS_HOST`, `WAHA_REDIS_PORT`, `WAHA_REDIS_PASSWORD` are documented and
persisted by the Infrastructure page, but no queue implementation exists ([[OpenWA Parity]]).

## MCP

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `MCP_READONLY` | false | register only `tier: read` tools | ✅ |
| `MCP_RATE_LIMIT_MAX` | 60 | requests per window per key | ✅ |
| `MCP_RATE_LIMIT_WINDOW_MS` | 60000 | window size | ✅ |
| `BUNWA_SESSION` / `BUNWA_MCP_KEY` | — | stdio transport auth | ✅ |

## Integrations

| Variable | Default | Purpose | Wired |
|---|---|---|---|
| `MILO_API_URL` | http://localhost:3003/api/webhooks/chatwoot/milo | Chatwoot → Milo auto-reply hook | ✅ |

## Related

[[Runbook]] · [[Data and Storage]] · [[Webhooks]] · [[MCP Server]] · [[Security Model]] · [[Known Gaps and Stubs]]

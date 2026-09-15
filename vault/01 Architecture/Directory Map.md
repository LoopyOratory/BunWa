---
type: note
section: architecture
tags: [bunwa, architecture, reference]
updated: 2026-09-14
source: src/, frontend/, scripts/, .github/
---

# 🗂️ Directory Map

Where things live. `⚠️` marks code that is present but **not wired into the running app** —
see [[Known Gaps and Stubs]].

## Repository root

| Path | What it is |
|---|---|
| `src/` | the Bun/Hono server (253 `.ts` files) |
| `frontend/` | React dashboard source (Vite project, own `package.json` + lockfile) |
| `frontend-dist/` | build output served by the server — produced by `scripts/build-frontend.sh`, not committed |
| `scripts/` | `dev.sh` · `start.sh` · `build-frontend.sh` |
| `docs/PROJECT.md` | legacy pre-vault feature log |
| `.github/workflows/` | `ci.yml` (test + lint + typecheck cap) and `docker.yml` (multi-arch image to Docker Hub) |
| `Dockerfile` / `Dockerfile.coolify` | production and Coolify-flavoured images ([[Docker and Deployment]]) |
| `README.md` · `CLAUDE.md` · `knowledgebase.txt` · `bun-docs.txt` | user docs, agent orientation, LLM dump, Bun notes |
| `vault/` | this Obsidian vault |
| `.env.example` | 362-line configuration reference ([[Configuration Reference]]) |

Runtime data directories (gitignored, created on boot): `.sessions/` (auth state + session index),
`data/` (audit + templates DBs), `frontend-dist/`.

## `src/` top level

| File | Role |
|---|---|
| `main.ts` | bootstrap, middleware chain, static serving, `Bun.serve`, `/ws` upgrade |
| `config.ts` | `getEngineName`, `getNamespace`, `getSessionNamespace` |
| `config.service.ts` | `WhatsappConfigService` — typed getters over `process.env` |
| `version.ts` | `VERSION` object + tier detection (`CORE`/`PLUS`) |
| `helpers.ts` | shared helpers |
| `swagger.ts` | hand-written OpenAPI 3.1 document ([[API Docs]]) |

## `src/api/` — 29 route modules + `index.ts` + `websocket.ts`

Route modules by domain (all mounted from `src/api/index.ts`):

| Module | Base path |
|---|---|
| `sessions.routes.ts` | `/api/sessions` — CRUD, start/stop/logout/restart, config, force-kill |
| `auth.routes.ts` | `/api/:session/auth` — QR + pairing code |
| `chatting.routes.ts` | `/api` — 25 send/act routes (+3 bulk routes in `createBulkRouter`) |
| `status.routes.ts` | `/api/:session/status` — stories |
| `chats.routes.ts` | `/api/:session/chats` — 22 routes |
| `contacts.routes.ts` | `/api/contacts` — global contact routes |
| `groups.routes.ts` | `/api/:session/groups` — 26 routes |
| `channels.routes.ts` | `/api/:session/channels` — 14 routes incl. `w:mex` search |
| `labels.routes.ts` | `/api/:session/labels` — 7 routes |
| `lids.routes.ts` | `/api/:session/lids` — LID ↔ phone mapping |
| `presence.routes.ts` | `/api/:session/presence` — 4 routes |
| `profile.routes.ts` | `/api/:session/profile` — 5 routes |
| `calls.routes.ts` | `/api/:session/calls/reject` |
| `webhooks.routes.ts` | `/api/sessions/:session/webhooks` — CRUD + `:id/test` |
| `templates.routes.ts` | `/api/sessions/:session/templates` |
| `mcp-config.routes.ts` | `/api/mcp/tools`, `/api/sessions/:session/mcp[/generate-key]` |
| `apps.routes.ts` | `/api/apps` — Chatwoot app CRUD |
| `media.routes.ts` | `/api/:session/media/convert/{voice,video}` |
| `files.routes.ts` | `/api/files/:session/:filename` — media serving |
| `audit.routes.ts` | `/api/audit` |
| `infra.routes.ts` | `/api/infra/config`, `/restart` |
| `server.routes.ts` | `/api/server/{version,environment,status,stop}` |
| `workers.routes.ts` | `/api/workers` |
| `ping.routes.ts` / `health.routes.ts` / `version.routes.ts` | public `/ping`, `/health`, `/api/version` |
| `events.routes.ts` | `POST /api/:session/events` — ⚠️ stub returning a fake id |
| `screenshot.routes.ts` | `GET /api/:session/screenshot` — base64 PNG (WEBJS) |
| `contacts.session.routes.ts` | ⚠️ imported but **never mounted** (2 dead routes) |
| `websocket.ts` | `/ws` handler ([[WebSocket Events]]) |

## `src/core/`

| Path | Role |
|---|---|
| `manager.core.ts` | `SessionManager` — the live one ([[System Overview]]) |
| `session/session.abc.ts` | abstract `WhatsappSession` + `SessionParams` — the engine contract |
| `session/session.browser.ts` | Chrome binary discovery for WEBJS |
| `session/activity.ts` | `@Activity()` decorator → presence auto-online refresh |
| `webhook-delivery.ts` | SSRF-guarded, HMAC-signed delivery with retries ([[Webhooks]]) |
| `webhook-signing.ts` *(in `common/security/`)* | HMAC helpers |
| `audit/audit.service.ts` | SQLite audit log ([[Audit Log]]) |
| `templates/template.service.ts` | SQLite message templates ([[Templates and Bulk Send]]) |
| `bulk-message.service.ts` | batch send registry |
| `media/` | `MediaManager`, storage factory, ffmpeg converter, audio helpers |
| `storage/` | `DataStore`/`LocalStore` abstractions, KV repositories ([[Data and Storage]]) |
| `engines/` | `noweb`, `webjs`, `gows`, `waproto` ([[Engines Overview]]) |
| `plugins/` + `hooks/` | ⚠️ plugin loader + hook manager, fully implemented, never instantiated |
| `config/` | dashboard / swagger / (empty) gows config services |
| `abc/` | ⚠️ legacy abstract manager, engine bootstrap, health check — dead code |
| `utils/`, `utils/reactive/`, `env.ts`, `exceptions.ts` | helpers, reactive ops, feature flags, domain exceptions |
| `shutdown.service.ts` | drain → readiness 503 → close |
| `export-import.service.ts` | ⚠️ tar.gz export/import with size caps — no API surface |
| `QR.ts` | QR → PNG rendering |

## `src/` other

| Path | Role |
|---|---|
| `apps/chatwoot/` | Chatwoot app: routes, DTO, service, JSON-file repository |
| `apps/app_sdk/services/IAppsService.ts` | ⚠️ placeholder class — no real app SDK exists |
| `mcp/` | MCP server, stdio entry, tool registry, rate limiter, 43 tool files ([[MCP Tools Reference]]) |
| `middleware/` | the request chain ([[Request Lifecycle]]) |
| `plus/` | Plus-tier engine override + S3 media ([[Plus Tier]]) |
| `common/security/` | `ssrf-guard.ts`, `webhook-signing.ts`, `webhook-filters.ts`, `wa-id.ts` |
| `structures/` | DTOs, enums, webhook payloads, Zod schemas |
| `__tests__/` | 13 test files + `setup.ts` (preloaded by `bunfig.toml`) |
| `di/container.ts` | tsyringe registrations ([[Dependency Injection]]) |
| `utils/` | JID helpers, event utilities, reactive plumbing |

## `frontend/src/`

See [[Dashboard]] for the full picture: `pages/` (14), `components/` (app + `ui/` shadcn primitives
+ vendored `ui/chat/` chat library), `lib/` (`api.ts`, `auth.tsx`, `use-websocket.ts`, `utils.ts`),
`hooks/`, plus `index.css` holding the design tokens.

## Related

[[System Overview]] · [[Known Gaps and Stubs]] · [[Testing]] · [[Dashboard]]

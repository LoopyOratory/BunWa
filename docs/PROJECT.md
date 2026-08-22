---
tags: [project, bunwa, whatsapp, openwa, baileys, api]
updated: 2026-08-22
repo: https://github.com/LoopyOratory/BunWa
upstream: https://github.com/rmyndharis/OpenWA
runtime: Bun 1.4.0
status: ACTIVE — 97/97 tests passing
---

# 🟢 BunWa — WhatsApp HTTP API (Bun/Hono Edition)

> LoopyOratory's implementation of [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA) —
> a WAHA-style WhatsApp HTTP API rebuilt on **Bun + Hono**, extended with "Plus" features.
> This vault logs **every feature and addon** in the project.

---

## Identity

| | |
|---|---|
| Package name | `waha-bun` (v2026.5.1) |
| Description | WhatsApp HTTP API — Bun/Hono Edition with Pro features |
| Runtime | **Bun ≥1.4.0** (Rust core; Node v26.3.0 compat layer) |
| Framework | Hono 4.x + Scalar API Reference at `/api-docs` |
| WA engine | Baileys `@whiskeysockets/baileys 7.0.0-rc13` (noweb) + optional webjs/puppeteer |
| Repo | github.com/LoopyOratory/BunWa |

---

## Architecture

```
src/
├── main.ts               # bootstrap: DI container, engines, routers, graceful shutdown
├── di/container.ts       # tsyringe container (services registered as instances)
├── api/                  # ~30 HTTP route modules (see Features → REST API)
├── core/
│   ├── manager.core.ts   # session lifecycle
│   ├── engines/          # gows · noweb · waproto · webjs
│   │   └── noweb/store/  # memory · postgres · sql · sqlite3 session stores
│   ├── audit/            # bun:sqlite audit.log (WAL) + retention cleanup
│   ├── storage/          # bun-sqlite · sql · sqlite3 adapters
│   ├── webhook-delivery.ts # SSRF-guarded delivery + HMAC + retries
│   ├── media/ templates/ plugins/ hooks/ session/ config/ utils/
├── apps/                 # Chatwoot integration + app SDK
├── mcp/                  # MCP server (43 tools) + tool registry
├── common/security/      # ssrf-guard, api-key auth, policies
frontend/                 # React dashboard (TanStack Query, Radix, Recharts, Framer Motion)
scripts/                  # start.sh · dev.sh · build-frontend.sh
```

---

## ✅ Feature Log

### Sessions & Auth
- Multi-session management (start/stop/restart/list/get) with persistent auth state
- Session stores: in-memory, SQLite3, SQL (pg), Postgres — pluggable via `noweb/store`
- QR-code pairing (terminal + dashboard), restore sessions from disk on boot
- API-key auth middleware + per-session scoped keys + policy middleware

### Messaging (send + manipulate)
- Text, image, file, voice note (with computed duration), video, location, poll,
  contact/vCard, link preview, list buttons, interactive buttons
- Reply, forward, react, star, mark-read; typing start/stop indicators
- Poll voting; message ID generation

### Chats & Contacts
- Chat history (`ChatGetMessages`), single message fetch, pin message, mark read, labels
- Contacts: check number (LID-aware), find phone by LID, full contact routes
- `searchChannelsByView/Text` via WhatsApp's w:mex directory API (channels feature)

### Status / Stories
- Send text/image/video/voice status; delete status; status ID generation
- Explicit audio-duration computation for voice statuses

### Groups
- Group management routes (groups.routes.ts) via noweb groups module

### Presence
- Subscribe/presence per chat, get-all/get-for-chat, set own presence

### Webhooks
- Subscription CRUD wired to settings save (re-wired on save — recent fix)
- Delivery pipeline: SSRF guard (blocks internal addresses, redirect pinning),
  HMAC signatures, custom headers, retry with backoff, max-retry give-up

### MCP Server ⭐
- **43 tools** mounted at `POST /mcp`, API-key protected, session-scoped permissions:
  - Messages (17): send text/image/file/voice/video/location/poll/vCard/link-preview/list/buttons, reply, forward, react, star, mark-read, vote-poll, typing, gen-id
  - Sessions (6): start/stop/restart/list/get/check-number
  - Chats (5): get messages/message, mark read, pin, set labels
  - Presence (4): subscribe, get-all, get-for-chat, set
  - Status (5): send text/image/video/voice, delete (+generate-id helpers)
  - Contacts (2): check number, find phone by LID
- Tool registry with duplicate-name protection

### Apps / Integrations
- **Chatwoot**: full app integration (api/dto/services/storage) with event subscription
- **App SDK** for additional first-party apps

### Audit & Observability
- Structured audit log (bun:sqlite, WAL mode): severity levels, action/session indexes,
  retention cleanup (`AUDIT_RETENTION_DAYS`)
- pino structured logging; health/readiness routes (503 draining on shutdown);
  version + ping endpoints

### Infra / Ops
- Dockerfile + Dockerfile.coolify + docker-compose (Coolify-ready)
- Graceful shutdown service (drain → readiness 503 → close)
- Export/import service; bulk-message service; template service; vCard builder
- Proxy support: HTTPS + SOCKS agents per session
- Plugin loader + hook manager (extension points)
- S3 media storage (`@aws-sdk/client-s3` + presigner)

### Dashboard (frontend/)
- React SPA: sessions, chats, webhooks/settings, audit log rows (message+session fixed),
  QR pairing, charts (Recharts), dark/light (next-themes), Oxanium/Noto Sans type

### Security
- SSRF guard on all outbound webhook/remote-file fetches (redirect-safe)
- API key auth (global + session-scoped), permission checks per MCP tool
- Audit trail on sensitive actions

---

## ➕ Plus-tier Addons (vs upstream OpenWA)

- Plus tier engine wiring + media storage + file serving (`feat(plus)` commits)
- Channel directory search (w:mex)
- MCP server surface (upstream has none)
- Voice-status audio duration computation
- Audit log with retention
- SSRF-hardened webhook delivery

---

## 🕘 Fix History (recent)

| Commit | Fix |
|---|---|
| `30ac09c` | tests: register AuditService instance in webhook test (tsyringe TypeInfo error ×10 tests) |
| `21cb433` | tests: isolate session storage from real data |
| `db3ec9d` | dashboard: audit log rows missing message/session |
| `a8097da` | webhooks: re-wire subscriptions on settings save |
| `46841f8` | status: compute audio duration for voice notes |
| `3b144ef` | status: stop swallowing real errors |
| `f76de62` | security: SSRF protection in fetchBuffer |
| `7c7e346` | channels: searchChannelsByView/Text via w:mex |

## 🆕 2026-08-22 — Bun 1.4 + fresh-boot hardening

- **Bun 1.4.0** adopted: `bunfig.toml` → `[install] linker="isolated" globalStore=true`
  (isolated linker + global virtual store ≈7× faster warm installs); `engines.bun >=1.4.0`
- **Fresh-clone boot fix**: `AuditService` auto-creates `WAHA_STORAGE_DIR` (default `./data`)
  — kills the `SQLITE_CANTOPEN` crash on first run; `start.sh` also mkdir's it.
- Verified: fresh clone → install (508 pkgs, 9.4s) → boot without manual steps → `97/97` tests.

---

## 🚀 Runbook

```bash
git clone git@github.com:LoopyOratory/BunWa.git && cd BunWa
bun install                # 508 packages (~9s)
bun run dev:api            # API only (watch mode) → :3000
bun run dev:ui             # dashboard dev server
bun run setup              # install + build frontend
bash scripts/start.sh      # production (builds frontend first)
bun test                   # 97 tests
bun run typecheck && bun run lint
# Docs: http://localhost:3000/api-docs · MCP: POST /mcp
```

Env essentials: `WAHA_API_KEY` (auth), `WAHA_STORAGE_DIR` (data dir, default ./data),
`AUDIT_RETENTION_DAYS`, S3 creds for media, Chatwoot config for integration.

---

## 🔁 OpenWA Parity (2026-08-22)

Audited upstream [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA) — **195 endpoints across 31 modules** — against BunWa's 279 routes. BunWa already covered ~90% of the user-facing surface (sessions, messages, chats, groups, channels, labels, presence, profile, status, webhooks, media convert, infra, audit, apps/Chatwoot, MCP).

### Added this pass (Bun/Hono implementations)
| Endpoint | Notes |
|---|---|
| `POST /:session/chats/:chatId/mute` · `/unmute` | engine-capability guarded |
| `GET /:session/chats/:chatId/messages/:messageId/media` | downloads via store + downloadMedia pipeline |
| `GET /:session/chats/:chatId/messages/:messageId/reactions` | from message payload |
| `POST /sendSticker` | image/webp through media pipeline (`sendMediaAsSticker`) |
| `POST /:session/messages/send-bulk` | wraps existing BulkMessageService; per-session batch registry |
| `GET /:session/messages/batch/:batchId` · `POST .../cancel` | batch status/cancel |
| `GET/PATCH /:session/config` | session config inspect/update |
| `POST /:session/force-kill` | hard kill without graceful drain |

### Deliberately NOT ported (upstream-only infrastructure)
- **Redis/BullMQ queue processors** (ingress/webhook) — BunWa delivers webhooks inline with SSRF guard + retries instead
- **Plugin marketplace/installer** (14 endpoints) — BunWa has its own plugin loader + hook manager
- **Integration instances/ingress/redrive** (~7k LOC) — tied to upstream's plugin runtime
- **Docker module** — Coolify handles this on our VPS
- **Metrics/Prometheus** — can add later if needed

### Verified
typecheck clean · 97/97 tests · live boot smoke on :3210 — all new routes mounted,
auth-gated, session-resolver working (404 "session not found" for unknown sessions = correct).

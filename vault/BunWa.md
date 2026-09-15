---
type: project
status: active
created: 2026-09-14
updated: 2026-09-14
aliases: [BunWa, waha-bun, WhatsApp HTTP API]
tags: [bunwa, project, whatsapp, api]
repo: https://github.com/LoopyOratory/BunWa
upstream: https://github.com/rmyndharis/OpenWA
version: 2026.5.1
runtime: Bun 1.4.2
tier: PLUS
license: BCL v1.0
---

# 🟢 BunWa — WhatsApp HTTP API (Bun/Hono Edition)

> A **1:1 API-compatible rewrite of [WAHA](https://waha.devlike.pro)** on the Bun runtime with
> Hono, delivering the same HTTP surface at a fraction of the resource cost — no Node.js, no
> JVM, faster cold start, lower memory. Forked from and extended beyond
> [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA).

## What it is

BunWa is a **WhatsApp HTTP API server**: you `POST /api/sendText` and a real WhatsApp account
sends the message. It speaks the WAHA REST dialect, so existing WAHA clients, SDKs and
integrations work unchanged. On top of that it ships:

- **Two WhatsApp engines**, selectable per session — [[NOWEB Engine|NOWEB]] (Baileys, no browser)
  and [[WEBJS Engine|WEBJS]] (whatsapp-web.js + headless Chrome).
- A **React dashboard** served by the same process ([[Dashboard]]).
- A **Model Context Protocol server** with 43 tools so AI agents can drive WhatsApp directly ([[MCP Server]]).
- **Webhooks** with HMAC signing, retries and SSRF protection ([[Webhooks]]).
- An **audit log**, **message templates**, **bulk send**, **Chatwoot** integration and a **Plus tier** ([[Plus Tier]]).
- Interactive OpenAPI docs at `/api-docs` ([[API Docs]]).

## Identity

| | |
|---|---|
| Package | `waha-bun` v `2026.5.1` — "WhatsApp HTTP API - Bun/Hono Edition with Pro features" |
| Runtime | **Bun ≥ 1.4.0** (`engines.bun`), verified on Bun 1.4.2; `bunfig.toml` uses the isolated linker + global store |
| Framework | Hono 4.x (+ `@scalar/hono-api-reference`) |
| DI / logging / validation | tsyringe · pino · Zod (with vestigial class-validator decorators) |
| WhatsApp libs | `@whiskeysockets/baileys` `7.0.0-rc14` · `whatsapp-web.js` `^1.34.7` · `puppeteer` `^24.38.0` |
| Database | `bun:sqlite` by default; PostgreSQL via Knex/pg; Mongo/MongoDB driver present but unwired |
| License | **BunWa Community License (BCL) v1.0** |
| Repo | [LoopyOratory/BunWa](https://github.com/LoopyOratory/BunWa) · Docker Hub `loopyoratory/bunwa` |

## License — BCL v1.0

Free for personal projects, open source, learning/research, non-profit and education.
**Commercial use is $200/month per organization** (SaaS, paid client work, or internal use
inside a for-profit company where it supports a revenue-generating function). Contributions
merged upstream are automatically licensed under BCL v1.0.

## Architecture in one screen

```text
        Browser (React dashboard, served from frontend-dist)
                        │  HTTP + /ws
   ┌────────────────────▼─────────────────────────────────────────┐
   │  Bun.serve  ──►  Hono app (src/main.ts)                       │
   │    /ws upgrade (Bun native)   /api-docs (Scalar)              │
   │    /api/*  ── logger → CORS → rate limit → body cap →         │
   │               api-key auth → policies → session resolver      │
   │    /mcp    ── Streamable-HTTP MCP (stateless)                 │
   │    /webhook/chatwoot/:session                                 │
   └────┬───────────────────────┬───────────────────┬──────────────┘
        │                       │                   │
   ┌────▼──────┐         ┌──────▼───────┐    ┌──────▼───────┐
   │  core/    │         │  engines/    │    │  apps/       │
   │ Session   │◄───────►│  noweb       │    │  chatwoot    │
   │ Manager   │         │  webjs       │    └──────────────┘
   │ webhooks  │         └──────┬───────┘
   │ audit     │                │
   └────┬──────┘         ┌──────▼───────────────┐
        │               │ Store (sqlite/pg)     │
   ┌────▼──────┐        │ Media (local/S3)      │
   │ .sessions │        └───────────────────────┘
   │ ./data    │
   └───────────┘
```

Details: [[System Overview]] · [[Request Lifecycle]] · [[Directory Map]]

## Feature groups

| Group | Highlights | Note |
|---|---|---|
| Sessions & auth | multi-session, QR + pairing code, restore on boot, API keys | [[System Overview]] |
| Messaging | text, image, file, voice, video, location, poll, vCard, link preview, buttons, list, sticker | [[Messaging]] |
| Chats / contacts / groups | history, pin, archive, mute, labels, group CRUD + participants | [[Chats Contacts Groups]] |
| Channels | follow/mute, directory search via WhatsApp's `w:mex` API | [[Channels and Labels]] |
| Status (stories) | text, image, voice, video + delete | [[Status Stories]] |
| Presence | subscribe, get all/for-chat, set own | [[Chats Contacts Groups]] |
| Webhooks | per-session CRUD, HMAC, retries, filters, SSRF guard, test-fire | [[Webhooks]] |
| Templates & bulk | per-session templates with `{{vars}}`, batch send + status/cancel | [[Templates and Bulk Send]] |
| Audit | SQLite WAL log, severity, indexes, retention | [[Audit Log]] |
| MCP | 43 tools, HTTP + stdio, per-session policy and keys | [[MCP Tools Reference]] |
| Plus tier | S3 media, profile-picture write, button header media | [[Plus Tier]] |
| Dashboard | sessions, chat UI, logs, infra, events, docs | [[Dashboard]] |

## What makes it a *fork* rather than a port

- [[Plus Tier|Plus-tier]] wiring for engine, media storage and file serving
- [[MCP Server]] — upstream OpenWA has no MCP surface at all
- [[Audit Log]] with retention, [[Webhooks|SSRF-hardened webhook delivery]]
- Voice-note/voice-status audio duration computed explicitly (WhatsApp requires it)
- Channel directory search through the `w:mex` binary node
- Deliberately **not** ported from upstream: Redis/BullMQ queue processors, the plugin
  marketplace, integration instances, a built-in Docker module, and Prometheus metrics —
  see [[OpenWA Parity]].

## Current state

| Signal | Value |
|---|---|
| Tests | 97 across 13 files — 95 pass, 2 fail ([[Testing]]) |
| Typecheck | `tsc --noEmit` → 0 errors (the CI cap of 1049 is a leftover from the type-cleanup campaign) |
| Lint | `oxlint src/` |
| Known stubs | [[Known Gaps and Stubs]] — GOWS engine, waproto helpers, unwired plugins/hooks, stub routes |
| Recent work | [[Fix History]] · UI modernisation, `baileys rc13 → rc14`, OpenWA parity endpoints |

## Vault map

[[Home|🏠 Vault home]] — architecture, engines, API, features, MCP, security, frontend, ops,
development and reference sections all live one click away.

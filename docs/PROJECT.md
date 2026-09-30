---
tags: [project, bunwa, whatsapp, openwa, baileys, api]
updated: 2026-09-29
repo: https://github.com/LoopyOratory/BunWa
upstream: https://github.com/rmyndharis/OpenWA
runtime: Bun 1.4.2
status: ACTIVE — 198/198 tests passing (25 files)
---

# 🟢 BunWa — WhatsApp HTTP API (Bun/Hono Edition)

> LoopyOratory's implementation of [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA) —
> a WAHA-style WhatsApp HTTP API rebuilt on **Bun + Hono**, extended with "Plus" features.
>
> ⚠️ **Superseded:** the maintained vault now lives in [`vault/`](../vault/Home.md) — architecture,
> engines, full endpoint reference, features, MCP tools, security model and a known-gaps list.
> This file is kept as the original feature log.

---

## Identity

| | |
|---|---|
| Package name | `waha-bun` (v2026.5.1) |
| Description | WhatsApp HTTP API — Bun/Hono Edition with Pro features |
| Runtime | **Bun ≥1.4.2** (Rust core; Node v26.3.0 compat layer) |
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

## 🆕 2026-09-29 — Bun 1.4.2 pin + adoption pass

- **Pinned to Bun 1.4.2**: `engines.bun >=1.4.2`, `.bun-version`, CI `bun-version: "1.4.2"`,
  Docker images `oven/bun:1.4.2` / `oven/bun:1.4.2-slim`; `@types/bun` / `bun-types` at 1.4.2.
- **`--no-orphans`** on the production launch (`start.sh` + both Dockerfiles): when the server
  exits, descendant processes die with it — notably the Chrome a WEBJS session spawns.
- **`bun test --parallel`** is the `test` script now (worker processes; suite ≈2.2s).
  `auth.test.ts` registers its own `AuditService` instance instead of relying on run order.
- **CI hardened**: `bun install --frozen-lockfile` + `PUPPETEER_SKIP_DOWNLOAD=true`.
- Lockfile stays **v1** for now: 1.4.2 reads/writes it fine; the v2 format (what fresh lockfiles
  get) needs a full re-resolution (measured: 113 version bumps) — a dependency-refresh concern.
- Evaluated and declined, with reasons: Bun.WebView, `Bun.cron`, HTTP/2 (h2c), `Bun.write`
  streaming, ws pause/resume — see [[Bun Runtime Adoption]].

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

---

## 🎨 Dream UI pass (2026-09-29)

The console was a serious green ops theme; the ask was a fun, dreamy, eye-candy UI with
beautiful animations, touching every component. No business logic changed: palette and
motion live in tokens (`index.css`) and shared pieces (`dream.tsx`, `primitives.tsx`).

| Area | What changed |
|---|---|
| Tokens | Full palette rebuild on Bun-brand colors: cream/vanilla light theme (default now) + deep plum dark theme; soft clay radii; glow shadows; pastel status chips; `.text-gradient` for brand moments. |
| Type | Fredoka (headings) + Nunito (body) via `@fontsource-variable`, replacing Oxanium. |
| Motion | Stagger entrances (`Stagger`/`StaggerItem`), rolling `CountUp` metrics, springy buttons/switch, sliding pills for tabs and sidebar nav (Framer Motion `layoutId`), ambient aurora + login orbs, confetti `celebrate()` on session actions, send-button pop in chat. `useReducedMotion` respected. |
| Components | Every ui/* primitive restyled: pill buttons, soft lifting cards, glass bordered menus, shimmer skeletons, pastel rich toasts, softer dialogs/sheets, uppercase table heads, redesigned switch. |
| Pages | Login rebuilt (split-screen, drifting orbs, password reveal toggle, gradient headline); dashboard + sessions stat cards stagger and count up; infra engine cards; sidebar regrouped Operate/Tools with animated active pill; chat bubble + composer polish. |
| Verified | `tsc -b` + vite build clean; live CDP pass over login/dashboard/sessions/infrastructure/events/logs/workers at 1440×900@2 and 390×844@3, light + dark; zero console errors; password reveal flips `password`→`text`; theme toggle flips `light`→`dark`→`light`; `bun run test` 198/0, typecheck + lint clean. |

## 🖥️ Desktop sizing + radius pass (2026-09-29)

Operator feedback: on desktop everything read too small and rounded corners looked like they
were cropping elements. Root cause: the dream pass kept the original compact density (28px
inputs, 12px text on desktop) and the 20px base radius was oversized relative to content.

| Area | What changed |
|---|---|
| Desktop scale | `@media (min-width: 1024px) { html { font-size: 18px } }`. Every rem-based token (type, controls, spacing, radii, sidebar width) scales together; mobile keeps 16px untouched. |
| Controls | Inputs h-7→h-8 (28→36px desktop), select triggers h-7→h-8, badges h-5→h-6, tabs h-8→h-9, table heads h-10→h-11, roomier button paddings (px-3.5→px-5 default, etc). |
| Radius | Base `--radius` 1.25rem→1rem so corners sit smaller relative to roomier content (cards 20→18px, dialogs 25px at desktop scale). |
| Card spacing | Default `--card-spacing` pinned to `--spacing(5)` (22.5px desktop); card titles and descriptions bumped one step. |
| Legacy overrides | Removed per-page `text-xs` / `text-[10-11px]` overrides on search inputs, filter selects and settings dialog controls that cancelled the scale. |
| Verified | Live CDP: root 18px desktop / 16px mobile, inputs 36px, zero horizontal overflow on 6 pages; dialog + open select menu inspected (no clipping); `bun run test` 198/0, typecheck + oxlint clean. |

## 🌌 Dreamscape v2 (2026-09-29)

Operator feedback on the first dream pass: "design wise I'll give it 3/10". Diagnosis: the dream
was only skin-deep. Flat near-white cards sat on a flat cream page, the sidebar was a solid slab
disjointed from the content area, and the ambient aurora was trapped inside the content inset, so
nothing shared a world. v2 moves the dream into the material itself.

| Area | What changed |
|---|---|
| One sky | `<Aurora/>` now renders once, fixed, behind the entire app incl. sidebar and login. Layers: gradient sky, bloom, 4 drifting aurora ribbons, light sparkles + bokeh (both themes), twinkling starfield (dark), bottom veil, film grain. |
| Glass system | One recipe, three densities in `index.css`: `.glass-card` (translucent gradient fill + gradient hairline border + inner top light + tinted shadow), `.glass-frost` (adds backdrop blur for fixed/sticky/hero), `.glass-pop` (denser, blurred overlay glass for menus/dialogs/sheets), `.glass-field` (inputs/textarea/select with focus glow ring). Blur reserved for fixed/sticky/overlay surfaces; scrolling cards paint gradients only (cheap). |
| The dock | Sidebar container padded 0.75rem, inner panel 26px radius, glass fill, frost; `SidebarInset` background made transparent so the sky runs edge to edge behind both columns. |
| Surfaces | Cards, stat cards, table wrappers, skeletons, empty states, page header, menus, dialogs, sheets, dropdowns, selects, tooltips all on the glass materials. Empty state now gradient glass + pastel dashed border + inner highlight; status chips get an inner light; ghost buttons get explicit `text-foreground/80`. |
| Size + type | Stat metrics text-3xl→text-4xl, page titles text-3xl, section headings text-lg, sidebar wordmark text-xl, login headline text-4xl. |
| Build fix | LightningCSS collapsed the hand-written standard+`-webkit-` backdrop-filter pairs to prefixed-only, which modern Chromium ignores (computed `backdrop-filter: none`). Source now declares only the standard property; the build autoprefixes. |
| Verified | CDP pass: dock blur live (`blur(24px) saturate(1.5)`), 17 aurora layers, gradient glass computed on cards/fields, zero horizontal overflow light+dark+mobile; MiMo vision review of login/dashboard/sessions/dialog/mobile in both themes rated 7.5–9/10 (was 3/10), issues it flagged (empty-state presence, dark secondary-text contrast, ghost-icon contrast) then fixed; `bun run test` 198/0, typecheck + oxlint clean. |

## 📊 Dashboard insights (2026-09-29)

Ask: the dashboard should show the data graphically, and the data should be filterable.

| Area | What changed |
|---|---|
| Insights section | New section between the stat cards and the tables: a filter bar plus five recharts views, all inside the glass material. |
| KPI cards | Two new stat cards: Messages (send volume in the selected range, with failed count and fail rate) and Issues (warn/error count with the dominant cause). |
| Charts | `SessionsDonut` (status mix, center total, pastel slices), `MessagesChart` (delivered vs failed per hour/day, header totals + fail rate), `SessionActivityChart` (lifecycle events: Created/Started/Stopped/QR), `IssuesChart` (warn+error audit events by cause: Messages/Webhooks/Auth/Sessions/Other), `WorkersLoad` (horizontal bars per worker with count labels, mint = connected). Stacked charts carry their own color legends. |
| Filters | Session dropdown (scopes the charts, KPIs and the sessions table to one session; "All sessions" releases), engine chips (All/NOWEB/WEBJS, apply to sessions and workers), a From/To date range with arbitrary dates (hourly buckets up to two days, daily beyond) plus Today/7d/30d quick presets, and a Reset filters action. |
| Data | Only real API data: sessions/workers/version as before, plus `GET /api/audit` (limit 500) fetched on a 30s cadence (gated so the 5s poll does not hammer it). Message volume comes from the `message_sent`/`message_failed` audit actions; issues are warn/error severities grouped by action into causes. |
| Verified | CDP pass on a seeded test store: session scoping works end to end (sales-bot: 0 delivered / 6 failed / 100%, Issues mostly Messages; gh-main: 19 / 1 / 5%, Issues mostly Webhooks; sessions table 3→1 rows, dropdown label tracks selection); preset and custom ranges reshape every chart (Today hourly HH:00, 7d/30d daily dates, custom from=26 Sep works); reset restores defaults; totals match the KPI cards; zero horizontal overflow light/dark; MiMo vision 8-8.5/10; `bun run test` 198/0, typecheck + oxlint clean. |

## 🏷️ Logo + uniform stat cards (2026-09-29)

The operator supplied a new logo and asked for the dashboard KPI cards to be uniform.

| Area | What changed |
|---|---|
| Logo | Adopted the supplied mark (kawaii bun in a glossy speech bubble on cream) as `logo.jpg`; the sidebar, login hero and `og:image` pick it up automatically. Regenerated `favicon.png` (64px) and `apple-touch-icon.png` (180px) from it; dropped the stale `favicon.svg` link and file. |
| Uniform cards | All five stat cards share the same shell now: `h-full flex-col` inside the grid (equal heights), the grid is `grid-cols-2 → lg:grid-cols-5`, and the last card spans both columns below lg so there are never holes at 390/768/1024 widths. |
| Pattern | The Server version card's footer was normalized to a one-line hint (`NOWEB engine`) like its siblings; its Changelog / How to update links moved to a "BunWa docs" line under the row. |
| Cache | Unhashed public assets (logo, favicons) now serve `no-cache` and revalidate; a stale 24h cache had masked the logo swap in browsers that visited before the change. |
| Verified | CDP: five cards render 205x215 pixel-identical at 1440px, mobile 2+2+1 full-width, zero horizontal overflow; MiMo vision 9/10 desktop and 9/10 mobile; logo re-verified after clearing the browser cache (natural size 1254x1254, 86028 bytes on sidebar light/dark and login); `bun run test` 198/0, typecheck + oxlint clean. |

## 🌍 Phone inputs: country selector + @c.us (2026-09-30)

The operator asked for a country selector on every phone-number field: the user types only the main number, the country code is prefixed and `@c.us` is added automatically.

| Area | What changed |
|---|---|
| Component | New `PhoneInput` (`frontend/src/components/phone-input.tsx`): country selector + national-number field with a live "Resolves to ..." preview line. The trigger shows a compact flag + dial code (`🇬🇭 +233`); the menu lists flag, name and code. |
| Data | `lib/phone-countries.ts` carries all 248 dial codes (flag + name + code), Ghana pinned first as the default; `lib/phone.ts` holds the resolution helpers (`toIntlDigits`, `toChatId`, `splitJid`). |
| Applied | Every phone entry point: message tester, chat New chat dialog, templates preview/send dialog, session QR dialog Phone pairing (digits preview, no suffix there). |
| Behaviour | Typing `201234567` with Ghana selected resolves to `233201234567@c.us` (with or without the local leading zero); pasting `+233 ...`, `00233 ...` or a full JID passes through untouched; opening `/messages/<jid>` splits the id back into country + local number so it stays editable. |
| Verified | CDP on the live app: Ghana default `201234567` -> `233201234567@c.us`; switching to the US + `5551234567` -> `15551234567@c.us`; all paste variants resolve identically; `/messages/233201234567@c.us` prefills Ghana + `201234567`; chat, templates and pairing dialogs each verified with typed input + preview; 390px mobile row fits without overflow; MiMo vision 9/10 on the input row; `bun run test` 198/0, typecheck + oxlint clean. |

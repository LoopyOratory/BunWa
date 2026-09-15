---
type: dashboard
aliases: [home, index, moc, bunwa vault]
updated: 2026-09-14
---

# 🟢 BunWa Vault

Everything about **BunWa** — a WAHA-compatible WhatsApp HTTP API rebuilt on **Bun + Hono**,
extended with a Plus tier, an MCP server for AI agents, and a React dashboard.

**Start here →** [[BunWa]] · [[Vault Guide]] · [[Runbook]] · [[Architecture Canvas.canvas|Architecture Canvas]] · [[Inbox]]

| | |
|---|---|
| Version | `2026.5.1` (package `waha-bun`) |
| Tier | `PLUS` (auto-detected from `src/plus/`) |
| Runtime | Bun ≥ 1.4.0 (verified on 1.4.2) |
| Engines | [[NOWEB Engine\|NOWEB]] (Baileys) · [[WEBJS Engine\|WEBJS]] (Puppeteer) |
| Tests | 104 tests / 15 files → **all passing** ([[Testing]]) |
| Typecheck | clean and **CI-enforced** — `tsc --noEmit` |
| Dependencies | 29 runtime deps ([[Bun Runtime Adoption]]) |
| License | [[BunWa#License — BCL v1.0\|BCL v1.0]] — free non-commercial, $200/mo commercial |

## 🗺️ Map of Content

### 🏗️ Architecture
- [[System Overview]] — runtime, layering, boot sequence
- [[Request Lifecycle]] — middleware order: auth → policy → session resolver → handler
- [[Directory Map]] — every folder in `src/` and what lives there
- [[Dependency Injection]] — the tsyringe container
- [[Data and Storage]] — where sessions, media, audit rows and templates are written

### 🔌 Engines
- [[Engines Overview]] — the `WhatsappSession` contract and how an engine is chosen
- [[NOWEB Engine]] — Baileys socket, reconnect logic, LID, w:mex channel search
- [[WEBJS Engine]] — whatsapp-web.js + Puppeteer, and what it can't do
- [[Session Stores]] — memory · sqlite3 · postgres (and the dead `sql` mixins)
- [[Proxy Support]] — per-session HTTPS/SOCKS agents

### 📡 API
- [[REST API]] — 29 route modules, mounting, conventions
- [[Endpoints by Domain]] — the full endpoint reference
- [[WebSocket Events]] — `/ws`, the 26 event types
- [[API Docs]] — hand-written OpenAPI + Scalar UI (and its drift)

### ✨ Features
- [[Messaging]] — every send/act route and what it needs
- [[Interactive Messages and Commerce]] — what buttons/lists we already have, what is feasible (carousel), what is not (flows/payments), and anti-ban tooling
- [[Chats Contacts Groups]]
- [[Channels and Labels]]
- [[Status Stories]]
- [[Webhooks]] — HMAC, retries, SSRF guard, filters
- [[Templates and Bulk Send]]
- [[n8n Integration]] — the `n8n-nodes-bunwa` community node (130 operations + trigger)
- [[Audit Log]]
- [[Plus Tier]] — what is actually gated

### 🤖 MCP
- [[MCP Server]] — transports, auth, per-session scoping, rate limits
- [[MCP Tools Reference]] — all 43 tools

### 🔐 Security & Quality
- [[Security Model]] — auth layers, policies, SSRF, secret handling
- [[Known Gaps and Stubs]] — dead code, stubs, and unfinished edges ⚠️

### 🖥️ Frontend
- [[Dashboard]] — React 19 + Vite + Tailwind v4, design tokens, auth flow

### 🚀 Ops
- [[Configuration Reference]] — every environment variable, grouped
- [[Runbook]] — dev, prod, fresh boot, troubleshooting
- [[Docker and Deployment]] — Dockerfile, Coolify, GitHub Actions
- [[Health and Observability]] — health, readiness, logs, workers
- [[Testing]] — the 13 test files and how to run them

### 🛠️ Development
- [[Code Conventions]] · [[Fix History]] · [[Roadmap]]
- [[Bun Runtime Adoption]] — the Bun 1.4.2 pass: native static serving, protocol body cap, S3 on Bun, dependency cleanup

### 📚 Reference
- [[Glossary]] — WAHA · JID · LID · NOWEB · tiers
- [[OpenWA Parity]] — the upstream audit and what was deliberately not ported
- [[Feature Tracker.base|📊 Feature Tracker]] (Obsidian Base)
- [[Architecture Canvas.canvas|🗺️ Architecture Canvas]] (Obsidian Canvas)

## 📊 Feature status (live)

```dataview
TABLE status AS "Status", engine AS "Engine", tier AS "Tier", endpoints AS "Endpoints"
FROM "04 Features"
WHERE type = "feature"
SORT status ASC, file.name ASC
```

## ⚠️ Watch list

- **Anti-ban tooling is still missing** (send caps, reachout timelock) — see
  [[Interactive Messages and Commerce]].
- Two interactive round-trip bugs: `/api/send/buttons/reply` sends nothing, and inbound
  `interactiveResponseMessage` taps are not parsed — [[Known Gaps and Stubs]].
- `WAHA_DB_TYPE` (dashboard/infra config) does **not** drive the runtime DB — `WAHA_DATABASE_DRIVER` does. See [[Configuration Reference#Two database switches]] and [[Data and Storage]].
- `/api-docs` documents **113** operations across 96 paths while the code mounts **~173** — [[API Docs|docs drift]].
- Several completed subsystems are never wired in: plugins/hooks, the file-storage service, Postgres/Mongo auth repos — see [[Known Gaps and Stubs]].
- `docs/PROJECT.md` in the repo is the **pre-vault** feature log; this vault supersedes it.

## 🔗 Repo entry points

- `README.md` — 753 lines of user-facing setup, config and API docs
- `CLAUDE.md` — agent-facing orientation and command list
- `knowledgebase.txt` — 879-line single-file project dump for LLM ingestion
- `docs/PROJECT.md` — legacy feature log (frontmatter already vault-shaped)

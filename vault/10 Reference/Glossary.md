---
type: note
section: reference
tags: [bunwa, reference]
updated: 2026-09-14
---

# 📚 Glossary

## Products & projects

| Term | Meaning |
|---|---|
| **WAHA** | "WhatsApp HTTP API" — the commercial/project API (`waha.devlike.pro`) whose REST surface BunWa reproduces |
| **OpenWA** | [`rmyndharis/OpenWA`](https://github.com/rmyndharis/OpenWA) — the upstream fork BunWa descends from ([[OpenWA Parity]]) |
| **BunWa** | this project — the Bun + Hono rewrite, with Plus features and an MCP server |
| **BunWa Community License (BCL) v1.0** | the licence: free non-commercial, **$200/month per organization** for commercial use |

## Engines

| Term | Meaning |
|---|---|
| **NOWEB** | The default engine: Baileys speaking the WhatsApp Web multi-device protocol directly. No browser ([[NOWEB Engine]]) |
| **WEBJS** | The alternative engine: `whatsapp-web.js` driving headless Chrome ([[WEBJS Engine]]) |
| **GOWS / WPP** | Other engine names in WAHA that exist here only as enum values or empty stubs |
| **Baileys** | `@whiskeysockets/baileys` — the TypeScript WhatsApp Web protocol library |
| **capability** | What an engine can do. There is **no formal capability matrix** in the code — the base class's default `NotImplementedByEngineError` is the de-facto signal ([[Engines Overview]]) |

## WhatsApp domain

| Term | Meaning |
|---|---|
| **JID** | Jabber ID — WhatsApp's address format: `15551234567@c.us` (user), `…@g.us` (group), `…@lid`, `…@newsletter` (channel), broadcast |
| **LID** | The newer "logical ID" identity layer WhatsApp is migrating to. LIDs must be mapped to phone numbers — the store keeps that map ([[Chats Contacts Groups]]) |
| **PN** | Phone-number JID, the classic `@c.us` form |
| **Newsletter** | WhatsApp's internal name for a **Channel** |
| **Status** | The 24-hour story feature ([[Status Stories]]) |
| **w:mex** | WhatsApp's internal binary query namespace, used here for channel directory search |
| **Argo** | WhatsApp's binary codec for channel payloads — the missing decoder is why channel message preview is gated |
| **Ack** | Delivery/read receipt event (`message.ack`) |
| **vCard** | Contact-card message payload |

## Architecture

| Term | Meaning |
|---|---|
| **Session** | One WhatsApp account: engine + config + store + auth state ([[System Overview]]) |
| **Session store** | Where chats/messages/contacts live — SQLite per session or Postgres ([[Session Stores]]) |
| **`SessionConfig`** | Per-session settings object persisted in `.sessions-index.json` (webhooks, proxy, engine, MCP policy, …) |
| **tsyringe** | The DI container ([[Dependency Injection]]) |
| **SSRF guard** | Outbound-request protection: DNS checks, CIDR blocklists, redirect pinning ([[Security Model]]) |
| **HMAC** | Hash-based signature used for webhook authenticity ([[Webhooks]]) |
| **MCP** | Model Context Protocol — the tool interface AI agents use ([[MCP Server]]) |
| **Streamable HTTP** | The MCP transport used at `POST /mcp` (stateless, per-request server instances) |
| **Tier (CORE / PLUS)** | Whether Plus overrides are active; in this fork detected from the presence of `src/plus` ([[Plus Tier]]) |

## Vault

| Term | Meaning |
|---|---|
| **MOC** | Map of content — a note that links out to a section, e.g. [[Home]] |
| **Base** | Obsidian's database view over notes; see [[Feature Tracker.base]] |
| **Canvas** | Obsidian's spatial board; see [[Architecture Canvas.canvas]] |

## Related

[[Home]] · [[Vault Guide]] · [[OpenWA Parity]] · [[Known Gaps and Stubs]]

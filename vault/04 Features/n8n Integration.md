---
type: feature
status: shipped
engine: [any]
tier: both
endpoints: 128
tags: [bunwa, feature, integration, n8n, automation]
updated: 2026-09-15
source: integrations/n8n-nodes-bunwa/
---

# 🔗 n8n Community Node

Automation integration for BunWa: **`n8n-nodes-bunwa`**, a community node package living in
`integrations/n8n-nodes-bunwa/`. It exposes **128 operations across 10 resources** plus a trigger
node, so WhatsApp workflows can be built without writing HTTP nodes by hand.

Modelled on [`rmyndharis/OpenWA-n8n`](https://github.com/rmyndharis/OpenWA-n8n) (the upstream
plugin), with the operation surface mapped to **BunWa's actual routes** rather than OpenWA's.

## Package layout

```text
integrations/n8n-nodes-bunwa/
├── credentials/BunWaApi.credentials.ts   # baseUrl + apiKey; test hits GET /api/sessions
├── nodes/BunWa/
│   ├── BunWa.node.ts                     # action node, composes the resource modules
│   ├── GenericFunctions.ts               # bunwaApiRequest + field builders + ResourceModule type
│   ├── bunwa.svg
│   └── resources/                        # 10 modules: message, session, chat, group, contact,
│                                         #   channel, label, presence, status, ops
├── nodes/BunWaTrigger/BunWaTrigger.node.ts
├── scripts/copy-icons.mjs                # icons must sit next to the compiled node files
└── test/                                 # manifest, description, routes, live-smoke
```

Every resource module exports `<name>Resource` (operations, properties, `execute`) and
`<name>Routes` (operation → `METHOD /path`). The routes map is the single source for both the
README tables and `test/routes.test.mjs`, which cross-checks every path against the **server's own
route files** so a typo cannot reach a release.

## Resources

| Resource | Operations | Covers |
|---|---|---|
| Message | 23 | every send type (text, image, file, voice, video, location, poll, contact, link preview, buttons, list), reply/forward/react/star, typing, seen, bulk send + batch status/cancel, id generation |
| Session | 13 | create, start, stop, restart, logout, force kill, delete, config get/update, QR, screenshot, list, get |
| Chat | 17 | list, overview, get/delete chat, messages, edit/delete/pin/unpin, read state, archive, reactions, picture |
| Group | 21 | create, join, leave, participants (add/remove/promote/demote, v1 + v2), subject, description, invite code, security settings, picture, list/count/refresh |
| Contact | 12 | contacts list/check/picture, LID mapping, profile read + name/status/picture writes |
| Channel | 12 | list/get/create, follow/unfollow, mute/unmute, directory search (by view, by text, facets) |
| Label | 7 | CRUD + chat ↔ label associations |
| Presence | 4 | get all, get for chat, set own, subscribe |
| Status | 6 | send text/image/voice/video stories, delete, id generation |
| Server | 13 | version, health, ping, server status, workers, audit logs, templates CRUD, MCP tools + policy, voice-note conversion |

## The trigger node

`BunWa Trigger` activates a workflow on session events. Its `webhookMethods` manage the
subscription lifecycle against BunWa itself:

- **create** → `POST /api/sessions/:session/webhooks` with this workflow's webhook URL and the
  selected events; the returned subscription id is kept in the workflow's static data.
- **checkExists** → `GET /api/sessions/:session/webhooks` and match on URL (idempotent activation).
- **delete** → `DELETE /api/sessions/:session/webhooks/:id` on deactivation.

Events offered include `message.any`, `message`, `message.ack`, `message.reaction`, `session.status`,
`presence.update`, `poll.vote`, `group.*`, `label.*`, `call.*` and `*` for everything. Because the
subscription lives in the session config, **BunWa must be able to reach the n8n instance** (same
requirement as any webhook), and the HMAC secret is optional.

## Deliberately not exposed

| Endpoint | Why |
|---|---|
| Chat mute/unmute | always 400: no engine implements `muteChat` ([[Interactive Messages and Commerce]]) |
| Contact block/unblock | always 500 "not available in NOWEB" ([[Known Gaps and Stubs]]) |
| Group delete | always 500 despite `deleteGroup` existing on the engine |
| `GET /api/contacts/about` | server stub returning an empty string |
| `POST /api/sendSticker` | the route lacks a `:session` path parameter for its session resolver, so it always fails |
| `GET /api/messages` | server stub returning `[]`; use Chat → Get Messages |
| Channel delete, channel message preview | engine support unverified / Plus-gated Argo decoder |
| Profile picture write | Plus-gated; exposed but throws on a Core build |

## Server bugs the integration surfaced

Building the node against the API (rather than against documentation) found real defects. These were
verified while implementing the operations and belong in the gap list:

1. **`POST /api/sendSticker` cannot work.** The route uses `workingSessionResolver()`, which reads
   `:session` from the path, but the route is mounted at `/api/sendSticker` with no path parameter —
   so every call fails with a 400. Fix is either `getSessionFromBody()` or a session-prefixed path.
2. **`GET /api/messages` is a stub** that returns an empty array. It should be removed or wired to the
   chat message store.
3. **Channel search facets are stubs**: `search/views`, `search/countries`, `search/categories`
   return `[]`.
4. **`convertVoiceNote`** ignores `convert` and answers with JSON `{data: base64, mimetype}`, not raw
   audio, which is not what the route name implies.
5. **Presence values**: `setOwn` accepts `offline | online | typing | recording | paused` (the Swagger
   enum's uppercase values would throw), and the NOWEB engine maps `online` to available.
6. **Status delete** uses `id` as its body field, not `messageId`, and status video silently ignores
   `convert`.

## Development

```bash
cd integrations/n8n-nodes-bunwa
npm install
npm run build     # tsc + copy icons into dist
npm test          # manifest, description, routes, live-smoke (13 pass, 3 skipped)
npm run lint
BUNWA_URL=http://localhost:3000 BUNWA_API_KEY=… npm test    # enables the live smoke test
```

Install into n8n with *Community nodes → Install → `n8n-nodes-bunwa`*, or point
`N8N_CUSTOM_EXTENSIONS` at this directory (symlink into `~/.n8n/custom`).

## Related

[[REST API]] · [[Endpoints by Domain]] · [[Webhooks]] · [[Known Gaps and Stubs]] · [[OpenWA Parity]] · [[Roadmap]]

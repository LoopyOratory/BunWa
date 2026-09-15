---
type: feature
status: partial
engine: [noweb]
tier: both
endpoints: 21
tags: [feature, api, whatsapp, gap]
updated: 2026-09-14
source: src/api/channels.routes.ts, src/api/labels.routes.ts, src/core/engines/noweb/noweb.newsletter.ts
---

# 📢 Channels and Labels

Two WhatsApp organisation features, both NOWEB-only. Channels are functional with one notable gap;
labels work but their colours are wrong.

## Channels (newsletters) — 14 routes

| Endpoint | Notes |
|---|---|
| `GET /api/:session/channels` | list channels the account follows |
| `POST /api/:session/channels` | create a channel |
| `GET /api/:session/channels/:id` | metadata |
| `DELETE /api/:session/channels/:id` | |
| `GET /api/:session/channels/:id/messages/preview` | ⚠️ throws `AvailableInPlusVersion` — the **Argo decoder is missing** |
| `POST /api/:session/channels/:id/follow` · `/unfollow` | |
| `POST /api/:session/channels/:id/mute` · `/unmute` | |
| `POST /api/:session/channels/search/by-view` · `/by-text` | directory search |
| `GET /api/:session/channels/search/views` · `/countries` · `/categories` | directory facets |

### Directory search — the interesting part

Baileys has **no** newsletter-directory API, so the engine implements it manually in
`noweb.newsletter.ts`: it sends a raw binary node with `xmlns: 'w:mex'` through `sock.query()`.

```text
query_id 6190824427689257   path xwa2_newsletters_directory_list
query_id 6802402206520139   path xwa2_newsletters_directory_search
```

That is the same private endpoint the WhatsApp Web client uses — which is why it works, and why it
is the most likely thing to break when WhatsApp changes something. Introduced in commit `7c7e346`.

> ⚠️ `channelsList` throws `NotImplementedByEngineError` and channel message preview is gated —
> channel *reading* is the weak spot. Creating, following, muting and directory search work.

## Labels — 7 routes

| Endpoint | Notes |
|---|---|
| `GET /api/:session/labels` | list labels |
| `POST /api/:session/labels` | create |
| `PUT /api/:session/labels/:labelId` | rename / recolour |
| `DELETE /api/:session/labels/:labelId` | |
| `GET · PUT /api/:session/labels/chats/:chatId` | labels assigned to a chat |
| `GET /api/:session/labels/:labelId/chats` | chats carrying a label |

Labels are backed by NOWEB store repositories (`Sqlite3LabelsRepository`,
`Sqlite3LabelAssociationsRepository`, or the Postgres equivalents) plus the
`label_jid` / `label_message` association types in `labels/LabelAssociationType.ts`.

> ⚠️ **Label colours are fake.** WhatsApp stores a colour *index* (0–19); the engine passes the hex
> straight through (`color: label.color as any`) in three places, with a `TODO` in the source. A label
> created with `#ff0000` will not round-trip its colour. See [[Known Gaps and Stubs]].

## Engine support

| | NOWEB | WEBJS |
|---|---|---|
| Channels | ✅ (read gaps) | ❌ |
| Labels | ✅ (colour caveat) | ❌ |

## Related

[[Chats Contacts Groups]] · [[NOWEB Engine]] · [[Known Gaps and Stubs]] · [[Endpoints by Domain]]

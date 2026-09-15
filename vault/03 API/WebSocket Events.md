---
type: note
section: api
tags: [bunwa, api, events]
updated: 2026-09-14
source: src/api/websocket.ts, src/main.ts, src/structures/enums.dto.ts
status: shipped
---

# 🔌 WebSocket Events

Real-time events — new messages, acks, reactions, session status changes — are streamed over a single
Bun-native WebSocket endpoint: **`/ws`**.

## Connecting

```text
ws://<host>/ws?session=<name|*>&events=<event,event|*>&user=<dashboard user>&pass=<dashboard pass>
```

| Param | Meaning |
|---|---|
| `session` | session name, or `*` (default) for all sessions |
| `events` | comma-separated event names, or `*` (default) |
| `user` / `pass` | dashboard Basic credentials (browsers can't set headers on a WebSocket) |

The API key can also be supplied as a header (non-browser clients) or a query parameter. Upgrades are
handled in `Bun.serve`'s `fetch` **before** Hono sees the request, so this route goes through no Hono
middleware at all — auth is done inline in `src/main.ts`.

## Behaviour

- On `open`, the handler parses the query params and subscribes to
  `sessionManager.getSessionEvents(session, events)`; every event is sent as one JSON frame.
- `message` frames from the client are **ignored** (there is no client → server protocol).
- On `close`, the subscription is released.
- Wildcards are unmasked in `src/utils/events.ts` — `events=*` expands to the full `WAHAEvents` list.

## Event types

`WAHAEvents` in `src/structures/enums.dto.ts`:

| Group | Events |
|---|---|
| Session | `session.status`, `state.change`, `engine.event` |
| Messages | `message`, `message.any`, `message.ack`, `message.reaction`, `message.edited`, `message.revoked`, `message.waiting` |
| Groups | `group.join`, `group.leave`, `group.update`, `group.participants` (v2 variants via the engine) |
| Other | `presence.update`, `poll.vote`, `chat.archive`, `call.received`, `call.rejected`, `label.upsert`, `label.deleted`, `label.chat.added`, `label.chat.deleted`, `event.response` |

The same enum drives webhook subscriptions ([[Webhooks]]) and the dashboard's Event Monitor
([[Dashboard]]).

## Who consumes it

| Consumer | Use |
|---|---|
| Dashboard chat page (`src/lib/use-websocket.ts`) | live message thread updates |
| Dashboard Event Monitor | live event stream buffer (500 entries), filter, export |
| Your own integrations | anything needing push instead of polling |

## Related

[[REST API]] · [[Webhooks]] · [[Dashboard]] · [[NOWEB Engine]]

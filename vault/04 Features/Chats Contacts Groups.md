---
type: feature
status: shipped
engine: [noweb, webjs]
tier: both
endpoints: 55
tags: [feature, api, whatsapp]
updated: 2026-10-04
source: src/api/chats.routes.ts, src/api/contacts.routes.ts, src/api/groups.routes.ts, src/api/presence.routes.ts, src/common/security/wa-id.ts
---

# 👥 Chats, Contacts, Groups, Presence

Four adjacent domains that share the session store and the JID layer.

## Chats — `src/api/chats.routes.ts` (22 routes)

| Area | Endpoints |
|---|---|
| Listing | `GET /api/:session/chats`, `GET/POST /api/:session/chats/overview` |
| Single chat | `GET · DELETE /api/:session/chats/:chatId` (delete clears for everyone) |
| Messages | `GET /…/messages`, `GET · DELETE · PUT /…/messages/:messageId` (PUT = edit) |
| Media & reactions | `GET /…/messages/:messageId/media`, `GET /…/messages/:messageId/reactions` |
| Pinning | `POST /…/messages/:messageId/pin` · `/unpin` |
| Read state | `POST /…/messages/read`, `POST /…/read` · `/unread` |
| Archive | `POST /…/archive` · `/unarchive` |
| Mute | `POST /…/mute` · `/unmute` — ⚠️ **always 400**: the handler guards on
`typeof session.muteChat === 'function'` and neither engine defines it |
| Picture | `GET /…/picture` |

Media fetched through the message-media route goes through the same pipeline as inbound media, so it
lands in the local (or S3) store with the usual short lifetime ([[Data and Storage]]).

## Contacts

| Endpoint | Notes |
|---|---|
| `GET /api/contacts`, `/contacts/all`, `/contacts/check-exists`, `/contacts/profile-picture` | global (session in body/query where relevant) |
| `GET /api/contacts/about` | ⚠️ **stub** — returns `{about: ''}` |
| `POST /api/contacts/block` · `/contacts/unblock` | ⚠️ **always 500** "not available in NOWEB" |
| `GET · PUT /api/:session/contacts/:id` | ⚠️ **dead routes** — module is imported but never mounted |

Contact **upsert**, listing and profile pictures work through the engine and the persistent store.

## Groups — `src/api/groups.routes.ts` (26 routes)

The most complete non-messaging surface:

| Area | Endpoints |
|---|---|
| Listing | `GET /groups`, `GET /groups/count`, `POST /groups/refresh` |
| Lifecycle | `POST /groups` (create), `DELETE /groups/:id` ⚠️ (always 500 despite `deleteGroup` existing), `POST /groups/join`, `GET /groups/join-info`, `POST /groups/:id/leave` |
| Detail | `GET /groups/:id` |
| Identity | `PUT /groups/:id/subject`, `PUT /groups/:id/description`, `GET·PUT·DELETE /groups/:id/picture` |
| Settings | `GET·PUT /groups/:id/settings/security/info-admin-only`, `…/messages-admin-only` |
| Invites | `GET /groups/:id/invite-code`, `POST /groups/:id/invite-code/revoke` |
| Participants | `GET /groups/:id/participants`, `GET /groups/:id/participants/v2`, `POST …/participants/add`, `…/remove`, `POST /groups/:id/admin/promote`, `…/demote` |

## Presence — `src/api/presence.routes.ts` (4 routes)

| Endpoint | Effect |
|---|---|
| `GET /api/:session/presence` | all known presences |
| `GET /api/:session/presence/:chatId` | presence for one chat |
| `POST /api/:session/presence` | set **your own** presence (available/unavailable) |
| `POST /api/:session/presence/:chatId/subscribe` | subscribe to a chat's presence updates |

Presence events arrive on the WebSocket/webhook bus as `presence.update` ([[WebSocket Events]]).

**Auto-online**: the base session class can mark you online whenever a session method runs, kept
online for a window afterwards — `WAHA_PRESENCE_AUTO_ONLINE` (default true),
`WAHA_PRESENCE_AUTO_ONLINE_DURATION_SECONDS` (default 25, matching WhatsApp Web's inactivity
timeout). Implemented with the `@Activity()` decorator in `src/core/session/activity.ts`.

## LIDs (WhatsApp's new identity layer)

`src/api/lids.routes.ts` exposes the LID ↔ phone-number map the NOWEB store maintains:
`GET /lids`, `/lids/count`, `/lids/:lid`, `/lids/pn/:phoneNumber`. Engine-neutral JID handling lives in
`src/common/security/wa-id.ts` (`@c.us`, `@g.us`, `@lid`, newsletter, broadcast), which is what makes
LID-aware `checkNumberStatus` and `fromMe` detection work ([[NOWEB Engine]]).

## Usernames (WhatsApp's handle layer)

WhatsApp usernames are an alias for a user's LID, not a separate address (Baileys PR #2480). Support
today, NOWEB only:

- **Classification**: `src/common/security/wa-id.ts` recognizes a bare `handle`, `@handle` and
  `handle@username` as `kind: 'username'` and validates against Meta's published rules
  (3-35 chars, `a-z 0-9 . _`, at least one letter, no leading/trailing/consecutive periods, no `www`
  prefix, no listed domain-like ending, case-insensitive).
- **Send targets**: the send methods and `checkNumberStatus` call `resolveSendTarget`, which resolves
  a valid handle through Baileys' `USyncQuery` username+contact query (`executeUSyncQuery`). A handle
  that cannot be resolved answers `422` naming the problem and pointing at a numeric JID; it is never
  turned into a broken `<handle>@c.us`.
- **Inbound**: `WAMessage.username` carries `key.remoteJidUsername` (1:1) or
  `key.participantUsername` (group participant); the console shows it in the chat header and message
  sender line.
- **WEBJS**: no lookup exists, so a username target is refused with a clear `422`.

Not possible yet: sending to a username if the server returns no address for it (the account may not
have the rollout), and resolving a username for chat lookups, labels or history. Verification against
a live paired account is still outstanding.

## Profile & calls

- `GET /api/:session/profile`; `PUT /profile/name`, `/profile/status`, `/profile/picture`
  (Plus-gated), `DELETE /profile/picture` (Plus-gated) — [[Plus Tier]].
- `POST /api/:session/calls/reject` — reject an incoming call; `call.received` /
  `call.rejected` events fire on the bus.

## Related

[[Messaging]] · [[Channels and Labels]] · [[NOWEB Engine]] · [[WEBJS Engine]] · [[Known Gaps and Stubs]]

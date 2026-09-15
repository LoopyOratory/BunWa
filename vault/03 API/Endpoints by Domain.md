---
type: note
section: api
tags: [bunwa, api, reference]
updated: 2026-09-14
source: src/api/*.routes.ts
status: shipped
---

# 📋 Endpoints by Domain

The authoritative endpoint reference — extracted from the route modules, **not** from the OpenAPI
document (which lags: [[API Docs]]). `⚠️` = stub or permanently-failing route.

## Infrastructure (public)

| Method | Path | Notes |
|---|---|---|
| GET | `/ping` | liveness, no auth |
| GET | `/health` | health; returns 503 while draining ([[Health and Observability]]) |
| GET | `/api/version` | `{version, engine, tier, platform, worker}` |
| GET | `/api/dashboard/login` | Basic-auth check for the dashboard UI |

## Server & infra

| Method | Path | Notes |
|---|---|---|
| GET | `/api/server/version` | version payload |
| GET | `/api/server/environment` | environment + engine info |
| GET | `/api/server/status` | status |
| POST | `/api/server/stop` | `process.exit(0)` — needs a supervisor |
| GET | `/api/workers` | single fake worker row, WAHA-shaped |
| GET | `/api/audit` | audit query: `limit`, `offset`, `severity`, action/session filters ([[Audit Log]]) |
| GET | `/api/infra/config` | DB/storage/queue settings for the dashboard |
| PUT | `/api/infra/config` | rewrites `./.env`, mirrors into `process.env` |
| POST | `/api/infra/restart` | `process.exit(0)` |

## Sessions & auth

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sessions` | list; `?all=true` for details |
| POST | `/api/sessions` | create (`upsert`) |
| GET | `/api/sessions/:session` | get one |
| PUT | `/api/sessions/:session` | update config |
| DELETE | `/api/sessions/:session` | delete (audits `SESSION_DELETED`) |
| POST | `/api/sessions/:session/start` | start, returns session + QR if needed |
| POST | `/api/sessions/:session/stop` | graceful stop |
| POST | `/api/sessions/:session/restart` | stop + start |
| POST | `/api/sessions/:session/logout` | engine logout, then delete |
| POST | `/api/sessions/:session/force-kill` | hard kill, no drain; audits `SESSION_FORCE_KILLED` |
| GET | `/api/sessions/:session/config` | inspect session config |
| PATCH | `/api/sessions/:session/config` | merge-update config (re-syncs webhooks) |
| GET | `/api/:session/auth/qr` | QR as base64 PNG; `?phoneNumber=` also returns a pairing code |
| POST | `/api/:session/auth/request-code` | request a pairing code explicitly |
| GET | `/api/:session/screenshot` | base64 PNG of the session view (WEBJS) |
| GET | `/api/mcp/tools` | full MCP tool registry + `byCategory` ([[MCP Server]]) |
| GET | `/api/sessions/:session/mcp` | MCP policy for a session |
| PUT | `/api/sessions/:session/mcp` | set `enabled`/`allowedTools`/`deniedTools`/`destructiveOps` |
| POST | `/api/sessions/:session/mcp/generate-key` | mints `sk_mcp_…`; plaintext shown once, only the SHA-256 hash is stored |

## Messaging

Session arrives **in the body** (`{ session, chatId, text, … }`) for the classic WAHA paths.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/sendText` | |
| POST | `/api/sendImage` · `/api/sendFile` · `/api/sendVoice` · `/api/sendVideo` | `convert` honoured for voice (ffmpeg) |
| POST | `/api/sendLocation` | sending works; response `location` field is always null (`waproto` stub) |
| POST | `/api/sendPoll` · `/api/sendPollVote` | |
| POST | `/api/sendContactVcard` | sending works; response `vCards` field is always null (same stub) |
| POST | `/api/sendLinkPreview` · `/api/send/link-custom-preview` | |
| POST | `/api/sendButtons` · `/api/send/buttons/reply` · `/api/sendList` | interactive messages |
| POST | `/api/sendSticker` | webp/png through the media pipeline with `sendMediaAsSticker` |
| POST | `/api/reply` · `/api/forwardMessage` · `/api/sendSeen` | |
| PUT | `/api/reaction` · `/api/star` | |
| POST | `/api/startTyping` · `/api/stopTyping` | |
| GET | `/api/checkNumberStatus` | LID-aware |
| GET | `/api/messages` | fetch messages for a chat |
| GET | `/api/:session/new-message-id` | generate an id before sending |
| POST | `/api/:session/messages/send-bulk` | 201 + `batchId` ([[Templates and Bulk Send]]) |
| GET | `/api/:session/messages/batch/:batchId` | batch status |
| POST | `/api/:session/messages/batch/:batchId/cancel` | cancel a running batch |

## Status (stories)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/:session/status/text` · `/image` · `/voice` · `/video` | voice computes audio duration explicitly |
| POST | `/api/:session/status/delete` | |
| GET | `/api/:session/status/new-message-id` | |

## Chats · contacts · groups

| Method | Path | Notes |
|---|---|---|
| GET | `/api/:session/chats` | list chats |
| GET | `/api/:session/chats/overview` · POST same path | overview (session must be running) |
| GET·DELETE | `/api/:session/chats/:chatId` | |
| GET | `/api/:session/chats/:chatId/messages` | `limit`/`offset`, optional media download |
| GET·DELETE | `/api/:session/chats/:chatId/messages/:messageId` | delete clears for everyone |
| PUT | `/api/:session/chats/:chatId/messages/:messageId` | edit message |
| GET | `/api/:session/chats/:chatId/messages/:messageId/media` | download media through the media pipeline |
| GET | `/api/:session/chats/:chatId/messages/:messageId/reactions` | from the stored payload |
| POST | `.../:messageId/pin` · `.../unpin` | |
| POST | `/api/:session/chats/:chatId/messages/read` | mark read |
| POST | `/api/:session/chats/:chatId/archive` · `/unarchive` · `/read` · `/unread` | |
| POST | `/api/:session/chats/:chatId/mute` · `/unmute` | ⚠️ always 400 — no engine implements `muteChat` |
| GET | `/api/:session/chats/:chatId/picture` | |
| GET | `/api/contacts` · `/contacts/all` · `/contacts/check-exists` · `/contacts/profile-picture` | |
| GET | `/api/contacts/about` | ⚠️ stub — returns `{about: ''}` |
| POST | `/api/contacts/block` · `/contacts/unblock` | ⚠️ always 500 "not available in NOWEB" |
| GET | `/api/:session/groups` · `/groups/count` · `/groups/:id` · `/groups/join-info` | |
| POST | `/api/:session/groups` | create |
| DELETE | `/api/:session/groups/:id` | ⚠️ always 500 "not available in NOWEB" (though the engine has `deleteGroup`) |
| POST | `/api/:session/groups/join` · `/groups/:id/leave` · `/groups/refresh` | |
| GET·PUT·DELETE | `/api/:session/groups/:id/picture` | |
| PUT | `/api/:session/groups/:id/subject` · `/description` | |
| GET·PUT | `/api/:session/groups/:id/settings/security/info-admin-only` · `…/messages-admin-only` | group security settings |
| GET | `/api/:session/groups/:id/invite-code` · POST `…/invite-code/revoke` | |
| GET | `/api/:session/groups/:id/participants` · `/participants/v2` | |
| POST | `/api/:session/groups/:id/participants/add` · `/remove` | |
| POST | `/api/:session/groups/:id/admin/promote` · `/demote` | |
| GET | `/api/:session/channels` · `/:id` · `/:id/messages/preview` | |
| POST | `/api/:session/channels` | create |
| DELETE | `/api/:session/channels/:id` | |
| POST | `/api/:session/channels/:id/follow` · `/unfollow` · `/mute` · `/unmute` | |
| POST | `/api/:session/channels/search/by-view` · `/by-text` | `w:mex` directory search |
| GET | `/api/:session/channels/search/views` · `/countries` · `/categories` | directory facets |
| GET | `/api/:session/labels` · `/:labelId/chats` | |
| POST | `/api/:session/labels` | create (colour mapping is faked) |
| PUT | `/api/:session/labels/:labelId` | |
| DELETE | `/api/:session/labels/:labelId` | |
| GET | `/api/:session/labels/chats/:chatId` · PUT same | chat ↔ label associations |
| GET | `/api/:session/lids` · `/lids/count` · `/lids/:lid` · `/lids/pn/:phoneNumber` | LID ↔ phone mapping |
| GET | `/api/:session/presence` · `/presence/:chatId` | |
| POST | `/api/:session/presence` | set own presence |
| POST | `/api/:session/presence/:chatId/subscribe` | |
| GET | `/api/:session/profile` | name/status/picture |
| PUT | `/api/:session/profile/name` · `/status` · `/picture` | picture is Plus-gated |
| DELETE | `/api/:session/profile/picture` | Plus-gated |
| POST | `/api/:session/calls/reject` | reject an incoming call |

## Media, files, templates

| Method | Path | Notes |
|---|---|---|
| POST | `/api/:session/media/convert/voice` | real ffmpeg → OGG/Opus |
| POST | `/api/:session/media/convert/video` | ⚠️ stub — returns a placeholder string |
| GET | `/api/files/:session/:filename` | serves local media, path-traversal guarded, ~180 s lifetime |
| GET | `/api/sessions/:session/templates` | list templates |
| POST | `/api/sessions/:session/templates` | create/replace (`UNIQUE(session, name)`) |
| DELETE | `/api/sessions/:session/templates/:id` | |

## Ops & integrations

| Method | Path | Notes |
|---|---|---|
| GET | `/api/sessions/:session/webhooks` | list subscriptions ([[Webhooks]]) |
| POST | `/api/sessions/:session/webhooks` | create (Zod-validated, `wh_` id) |
| PUT·DELETE | `/api/sessions/:session/webhooks/:id` | |
| POST | `/api/sessions/:session/webhooks/:id/test` | real delivery attempt; 422 on failure |
| GET·POST | `/api/apps` | app instances (Chatwoot) |
| GET·PUT·DELETE | `/api/apps/:id` | |
| GET | `/api/apps/chatwoot/locales` | hardcoded locale list |
| POST | `/api/:session/events` | ⚠️ stub — returns a fake `{id, timestamp}` |
| POST | `/webhook/chatwoot/:session` | Chatwoot → WhatsApp inbound; HMAC-verified, not api-key protected |

## Never mounted

| Method | Path | Status |
|---|---|---|
| GET | `/api/:session/contacts/:id` | ⚠️ dead — `createContactsSessionRouter` is imported but not mounted |
| PUT | `/api/:session/contacts/:chatId` | ⚠️ dead, same reason |

## Related

[[REST API]] · [[WebSocket Events]] · [[Known Gaps and Stubs]] · [[Messaging]] · [[Webhooks]]

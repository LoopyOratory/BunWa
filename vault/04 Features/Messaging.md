---
type: feature
status: shipped
engine: [noweb, webjs]
tier: both
endpoints: 26
tags: [feature, api, whatsapp]
updated: 2026-09-14
source: src/api/chatting.routes.ts, src/core/engines/noweb/session.noweb.core.ts
---

# ✉️ Messaging

Sending and manipulating messages. This is the largest single route module:
`src/api/chatting.routes.ts` — 25 routes in the main router plus 3 bulk routes.

## Sending

| Route | Payload | Notes |
|---|---|---|
| `POST /api/sendText` | `chatId`, `text`, `linkPreview?`, `mentions?` | link previews can be customised via `/api/send/link-custom-preview` |
| `POST /api/sendImage` | `file` (URL/base64/data-URL) + `caption` | media pipeline handles download + mimetype |
| `POST /api/sendFile` | `file`, `filename` | documents, any mimetype in the allow-list |
| `POST /api/sendVoice` | `file`, `convert` | `convert=true` runs **ffmpeg** → OGG/Opus (32 kbps, 48 kHz mono), which is the only format WhatsApp voice notes accept |
| `POST /api/sendVideo` | `file`, `convert?` | video conversion is **not** implemented — send already-encoded files |
| `POST /api/sendLocation` | `latitude`, `longitude` | sending works; ⚠️ the WAHA-shaped **response** has `location: null` because the `waproto` extractor is a stub ([[Known Gaps and Stubs]]) |
| `POST /api/sendPoll` | `poll{}` | options + multiple-answers flag |
| `POST /api/sendPollVote` | `pollMessageId`, `votes` | |
| `POST /api/sendContactVcard` | `contacts[]` | sending works; ⚠️ same `waproto` stub → `vCards: null` in the response |
| `POST /api/sendLinkPreview` | `url` + overrides | |
| `POST /api/sendButtons` | `buttons[]`, `headerImage?` | header image needs Plus (`uploadMedia`) |
| `POST /api/send/buttons/reply` | button reply | |
| `POST /api/sendList` | `sections[]` | native-flow list node built inline in the engine |
| `POST /api/sendSticker` | webp/png | routed through the media pipeline with `sendMediaAsSticker` |

All of these take `session` **in the body** (WAHA dialect) — see [[REST API#Two path dialects]].

## Acting on messages

| Route | Effect |
|---|---|
| `POST /api/reply` | quoted reply |
| `POST /api/forwardMessage` | forward to another chat |
| `PUT /api/reaction` | add/remove a reaction |
| `PUT /api/star` | star/unstar (NOWEB) |
| `POST /api/sendSeen` | mark a chat as seen |
| `POST /api/startTyping` · `/api/stopTyping` | typing indicator |
| `GET /api/checkNumberStatus` | LID-aware registered-on-WhatsApp check |
| `GET /api/messages` | fetch messages for a chat |
| `GET /api/:session/new-message-id` | mint an id before sending (needed for `messageId` correlation) |

Plus the chat-scoped manipulation endpoints — pin, unpin, edit, delete, mark-read, reactions,
media download — listed in [[Endpoints by Domain#Chats · contacts · groups]].

## How a send flows

```text
POST /api/sendText
  → apiKeyAuth → policy → getSessionFromBody()
  → session.sendText()            (engine base class contract)
     NOWEB → sock.sendMessage(jid, {...})   with echoed-message tracking
     WEBJS → client.sendMessage()  via MessageMedia for attachments
  → sentMessageIds tagging (so the outgoing event is attributed correctly)
  → optional webhook/event emission (message.any)
```

Media inputs accept an **HTTP URL**, a **base64 blob** or a **data URL**; `MediaManager.processMedia()`
downloads/validates against `WHATSAPP_FILES_MIMETYPES` and stores through the configured backend
(local or S3) before the engine uploads it ([[Data and Storage]]).

## Engine support

| Capability | NOWEB | WEBJS |
|---|---|---|
| text / image / file / voice / video / location | ✅ | ✅ |
| poll, vCard, buttons, list, sticker | ✅ | ❌ |
| reply, forward, reaction, seen, typing | ✅ | ✅ |
| edit, delete, star, pin, mark-read | ✅ | partial (delete yes, edit/star/pin no) |

## Related

[[REST API]] · [[Endpoints by Domain]] · [[Templates and Bulk Send]] · [[NOWEB Engine]] · [[WEBJS Engine]]

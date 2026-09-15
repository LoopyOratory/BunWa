---
type: feature
status: shipped
engine: [noweb]
tier: both
endpoints: 6
tags: [feature, api, whatsapp]
updated: 2026-09-14
source: src/api/status.routes.ts, src/core/engines/noweb/session.noweb.core.ts
---

# 📸 Status (Stories)

WhatsApp "Status" — the 24-hour story feed. NOWEB-only, 5 send/delete routes plus an id helper.

| Endpoint | Notes |
|---|---|
| `POST /api/:session/status/text` | text status, with background colour + font options |
| `POST /api/:session/status/image` | image + caption |
| `POST /api/:session/status/voice` | voice note status — **audio duration is computed explicitly** |
| `POST /api/:session/status/video` | video + caption |
| `POST /api/:session/status/delete` | delete a posted status |
| `GET /api/:session/status/new-message-id` | mint a status id up front |

## Two fixes that matter

1. **Voice duration** (commit `46841f8`): WhatsApp requires the audio duration in the status payload.
   The engine now computes it (via `ffprobe` helpers in `core/media/audio.ts`) instead of sending an
   empty value, which made voice statuses silently fail to render for recipients.
2. **Error surfacing** (commit `3b144ef`): image/voice/video status sends used to swallow real
   errors, so the API returned success while nothing was posted. Errors now propagate.

## Broadcast mechanics

Statuses are broadcast to your contact list, which WhatsApp rate-limits — the engine batches the
recipient list and retries failures rather than firing one send per contact.

## Engine support

| | NOWEB | WEBJS |
|---|---|---|
| Statuses | ✅ text / image / voice / video / delete | ❌ `NotImplementedByEngineError` |

> Status *receiving* (someone else's status) is not exposed as an endpoint; new statuses surface
> through the normal message/event stream depending on your ignore settings
> (`WAHA_SESSION_CONFIG_IGNORE_STATUS`, [[Configuration Reference]]).

## Related

[[Messaging]] · [[NOWEB Engine]] · [[Endpoints by Domain]] · [[Fix History]]

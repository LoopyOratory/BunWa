---
type: note
section: reference
tags: [bunwa, reference, parity]
updated: 2026-09-14
source: docs/PROJECT.md, git commit 2e437d4 + 87b0567
status: shipped
---

# 🔁 OpenWA Parity

BunWa is a fork of [`rmyndharis/OpenWA`](https://github.com/rmyndharis/OpenWA). A parity audit
(2026-08-22, commits `2e437d4` + `87b0567`) compared upstream's surface against this implementation.

## Audit result

| | Upstream OpenWA | BunWa |
|---|---|---|
| Endpoints | **195 across 31 modules** | **175 route definitions** in `src/api` (173 mounted) → 181 repo-wide routes |
| MCP surface | none | **43 tools** |
| Queue | Redis/BullMQ processors | inline delivery with retries |
| Verdict | — | ~90 % of the user-facing surface already covered |

> ⚠️ `docs/PROJECT.md` states "BunWa's 279 routes". A literal count of HTTP route registrations gives
> **175** in `src/api` plus 6 elsewhere (MCP endpoint, Chatwoot webhook, docs/login/static). The 279
> figure is a looser count (it appears to include method+path pairs differently or MCP/auxiliary
> surfaces). Use the route count in [[REST API]] when you need precision.

## Added during the parity pass

| Endpoint | Notes |
|---|---|
| `POST /:session/chats/:chatId/mute` · `/unmute` | engine-capability guarded — and since no engine implements `muteChat`, it always 400s ([[Known Gaps and Stubs]]) |
| `GET /:session/chats/:chatId/messages/:messageId/media` | downloads via the store + media pipeline |
| `GET /:session/chats/:chatId/messages/:messageId/reactions` | read from the stored message payload |
| `POST /sendSticker` | image/webp through the media pipeline with `sendMediaAsSticker` |
| `POST /:session/messages/send-bulk` | wraps `BulkMessageService`; per-session batch registry |
| `GET /:session/messages/batch/:batchId` · `POST …/cancel` | batch status and cancel |
| `GET`/`PATCH /:session/config` | session config inspect/update |
| `POST /:session/force-kill` | hard kill without graceful drain |

## Deliberately NOT ported

| Upstream feature | Why not |
|---|---|
| **Redis / BullMQ queue processors** (ingress + webhook) | BunWa delivers webhooks inline with an SSRF guard and bounded retries instead — no Redis dependency for a single-node deployment ([[Webhooks]]) |
| **Plugin marketplace / installer** (14 endpoints) | BunWa has its own plugin loader + hook manager — currently unwired ([[Known Gaps and Stubs]]) |
| **Integration instances / ingress / redrive** (~7 k LOC) | tied to upstream's plugin runtime, which this fork doesn't use |
| **Docker module** | Coolify manages containers on the target VPS ([[Docker and Deployment]]) |
| **Metrics / Prometheus** | not present; identified as a roadmap item ([[Roadmap]]) |

## Where BunWa goes further

- **MCP server** with 43 tools, per-session keys and policy — nothing equivalent upstream
- **Audit log** with retention and an API ([[Audit Log]])
- **SSRF-hardened** webhook delivery with HMAC, idempotency keys and filters ([[Webhooks]])
- **Channel directory search** via the private `w:mex` node ([[Channels and Labels]])
- Voice-note and voice-status **audio duration** computed explicitly
- **LID** mapping support throughout the store and JID layer

## Verification note

The parity pass was verified with: typecheck clean, 97/97 tests at the time, and a live boot smoke
test on `:3210` — all new routes mounted, auth-gated, with the session resolver returning a correct
404 for unknown sessions. Current test state (95/97) is documented in [[Testing]].

## Related

[[BunWa]] · [[REST API]] · [[Known Gaps and Stubs]] · [[Roadmap]] · [[Fix History]]

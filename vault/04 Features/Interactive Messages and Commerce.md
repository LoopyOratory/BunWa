---
type: note
section: features
status: partial
tags: [bunwa, feature, interactive, commerce, gap]
updated: 2026-09-29
source: src/core/engines/noweb/noweb.buttons.ts, src/structures/chatting.buttons.dto.ts, WAProto, src/core/bulk-message.service.ts
---

# 🧩 Interactive Messages & Commerce — Feasibility

Assessment of "API-only" interactive/commerce features against what this codebase can actually do
over the **NOWEB (Baileys)** web protocol. Evidence is from the installed
`@whiskeysockets/baileys` 7.0.0-rc14 proto (`WAProto/index.d.ts`) and `src/`.

## Already implemented ✅

`sendButtons` (`src/api/chatting.routes.ts` → `noweb.buttons.ts`) already emits the modern
`interactiveMessage` / `nativeFlowMessage` shape, and **all four CTA types exist**:

| Feature | Verdict | Evidence |
|---|---|---|
| **Reply buttons** | ✅ | `ButtonType.REPLY` → native flow `quick_reply` (`noweb.buttons.ts:6-8`) |
| **URL buttons** | ✅ | `ButtonType.URL` → `cta_url` (+ `merchant_url`) |
| **Call buttons** | ✅ | `ButtonType.CALL` → `cta_call` (+ `phone_number`) |
| **Copy-code buttons** | ✅ | `ButtonType.COPY` → `cta_copy` (+ `copy_code`) |
| **FAQ / question list** | ✅ | `sendList` → native flow **`single_select`** with sections + rows (`session.noweb.core.ts:1355-1400`) |
| **Mark as read / typing presence** | ✅ | `sendSeen`, `startTyping`/`stopTyping`, auto-online presence |
| **Labels, location, webhooks** | ✅ | labels have a colour caveat; location *sends* fine (only the response `location` summary is null) |

Both are also exposed to agents: MCP tools `MessageSendButtons` and `MessageSendList`
([[MCP Tools Reference]]).

## Live commerce drill (2026-10-04, NOWEB `vivita`)

Every interactive kind was sent to the test number and answered 200: all seven button types
(`reply`, `url`, `call`, `copy`, `catalog`, `location`, `flow`), `sendList`, `sendPoll`,
`sendContactVcard`, `sendLinkPreview`, `sendLocation`, `sendImage`, `sendFile` and `sendVoice`.
The per minute sending policy stopped two of them with 429 and a `retryAfterSeconds`, which is the
anti-ban layer working as designed; both went through after the cooldown.

| Change from the drill | Detail |
|---|---|
| **Inbound order and product messages are typed** | `extractMessageType`, `extractOrder` and `extractProduct` now put `type` (`order`, `product`, `poll`, `buttons_response`, `list_response`, …), `order` and `product` on the message payload, and webhook filters accept the new type names, so a workflow can branch on an incoming cart without decoding `_data`. Covered by tests built from realistic inbound payloads; it cannot be exercised live without a real customer order. |
| **Catalog and flow buttons are accepted by the API** | Both send. A `catalog` button only renders a storefront for a business account with a catalog, and a `flow` button without a `flow_id` is accepted but cannot launch anything. |
| **Unfetchable media answers 422** | A file URL the host refuses, and a voice note that needs ffmpeg on a host without it, both used to answer a bare 500. Each now names its cause and the fix. |
| **Voice notes need Ogg/Opus or ffmpeg** | An Ogg/Opus file is sent as is. Anything else is transcoded, which needs ffmpeg (present in both Docker images, absent from a bare dev host). |

> **Missing validation:** WhatsApp silently drops messages that exceed its limits —
> **≤ 3 buttons**, **≤ 10 list rows across ≤ 3 sections**. Nothing in the code checks this, so an
> over-limit call returns success and the message never renders. Adding DTO validation (also to the
> `sections: any[]` field in `SendListRequest`) is a cheap correctness win.

## Broken round-trip ⚠️ (fix before adding anything new)

Two concrete defects make the interactive *conversation* loop unreliable:

### 1. `POST /api/send/buttons/reply` is a no-op

`src/api/chatting.routes.ts:270-276` returns `{ result: true }` and sends nothing. The engine method
it should call exists and is implemented — `sendButtonsReply()` at
`session.noweb.core.ts:1259` (builds a `buttonsResponseMessage`) — but **no caller exists anywhere**,
so it is unreachable dead code. Wiring it is a few lines.

### 2. Incoming native-flow taps are not parsed

`extractBody()` (`session.noweb.core.ts:3600-3643`) handles the *legacy* response shapes —
`templateButtonReplyMessage`, `buttonsResponseMessage`, `listResponseMessage` — but **not
`interactiveResponseMessage`**, which is what a tap on a native-flow button or a `single_select` row
actually produces (`interactiveResponseMessage.body.text` and
`nativeFlowResponseMessage.paramsJson`).

So: BunWa *sends* native-flow buttons/lists, and parses the response format of the *older* message
type it no longer sends. A user tapping a button therefore arrives with `body: null` (the raw payload
is still in `_data`, so nothing is lost — it just is not surfaced).

> **Shipped 2026-09-29:** every inbound selection now also carries a structured
> `interactive {type: 'button'|'list'|'flow', selectedId, selectedText, repliedToMessageId}`
> field on the message payload (`extractInteractiveReply()`), covering all four response shapes
> including `interactiveResponseMessage`. `extractBody()` is unchanged.

**Verify with one live tap**, then parse both shapes and expose them as first-class fields
(e.g. `selectedButtonId` / `selectedRowId`) instead of stuffing text into `body`.

## Feasible to add — no Meta infrastructure needed

| Feature | Feasible | Why / how | Effort |
|---|---|---|---|
| **Carousel** (scrollable cards) | ✅ yes | Proto has `interactiveMessage.carouselMessage.cards[]`, and each card is a full `IInteractiveMessage` with its own header/body/footer/`nativeFlowMessage` — so cards with image + buttons are encodable today. **Biggest genuine gap vs the official API.** | ~1 day (DTO + builder + route + MCP tool) |
| **Multi-select list** | ⚠️ experimental | Would be a native flow button named `multi_select` with a sections payload — plain JSON, so encodable; but WhatsApp renders multi-select mainly in business/catalog contexts. Needs a live test on a real account. | ~0.5 day + testing |
| **Single product message** | ⚠️ needs catalog | `productMessage` exists in the proto (`product` snapshot, `businessOwnerJid`, `catalog`). Sending requires a product id from a **real business catalog** — the message is a card linking to an existing catalog entry. | ~0.5 day, only useful for business accounts |
| **Catalog / storefront button** | ⚠️ needs catalog | `interactiveMessage.shopStorefrontMessage` and `.collectionMessage` exist in the proto — a "view catalog" CTA. Same catalog dependency. | ~0.5 day |
| **Receiving carts / orders** | ✅ done | `orderMessage` is now parsed into a typed payload (`type: order`, `order: {...}`) and webhook filters accept the `order` type, so a workflow can branch on a cart. Still to add: a dedicated `order.received` event name. | done 2026-10-04 |
| **Sending order confirmation** | ⚠️ experimental | `orderMessage` can be constructed, but whether WhatsApp relays an order-details message from a non-business web session is unverified. | test first |

## Not feasible (or not worth it)

| Feature | Verdict | Reason |
|---|---|---|
| **WhatsApp Flows** | ❌ | **No `FlowMessage` type in this proto**, and flows are only *launched* by a native-flow button referencing a `flow_id` created in Meta Business Manager. Responses come back through Meta's encrypted Flow Data API (RSA/AES endpoint you must host) — impossible to make self-contained here. Only "launch an existing flow" is even conceivable, and it cannot be tested without Meta setup. |
| **Official templates** (approved categories, auth/OTP templates, media headers, **labeled prices**) | ❌ | A Cloud-API concept. `templateMessage` in the proto is the legacy HSM shape and cannot be relayed without a Meta-approved template. `LabeledPrice` is not in the proto at all. **Emulate instead:** BunWa already has per-session templates with `{{variables}}` ([[Templates and Bulk Send]]) — render them into normal or interactive messages. |
| **Catalog CRUD via API** | ❌ | Meta Business Management API only; there is no web-protocol path. (Automating WhatsApp Web's catalog UI through WEBJS/Puppeteer is theoretically possible and practically brittle.) |
| **WhatsApp Pay / payments / invoices** | ❌ | Country- and business-gated; `invoiceMessage` exists in the proto but the web protocol is not a supported payment path. |
| **Business profile management** (hours, address, email, website) | ❌ | No Baileys API for business-profile fields; name/status/picture are the only writable profile surfaces ([[Plus Tier]]). |

## Anti-ban tooling — ✅ shipped (2026-09-29)

The sending policy is live: `SendingPolicyService` in `src/core/sending-policy/` persists counters
in `${WAHA_STORAGE_DIR}/sending-limits.db` (bun:sqlite, WAL) and gates every outbound message at
the NOWEB engine's send methods, so REST, bulk and MCP are all covered.

Shipped controls: per-minute/hour/day caps (`SEND_MAX_PER_*`), reachout timelock between distinct
never-written chats (`REACHOUT_MIN_INTERVAL_SECONDS`), new-chat daily quota (`NEW_CHATS_PER_DAY`),
warm-up ramp over 14 days with a 20% floor (first-seen date per session), quiet hours
(`SEND_QUIET_HOURS`), global switch and per-session bypass (`SEND_POLICY_ENABLED`,
`SEND_POLICY_BYPASS_SESSIONS`), and per-session overrides in the `policy` table via
`PUT /api/sessions/:session/policy`. Blocked sends answer 429 with `Retry-After`
(`TooManyRequestsException`), and `GET /api/sessions/:session/policy/usage` reports counters and
next-allowed times. Introspection surfaces usage in `GET /api/sessions/:session/policy`.

The design table below is kept as the design record. Still outstanding from it: the circuit
breaker (Roadmap A6) and an optional `message_throttled` audit row / webhook event.

> Nothing in the codebase caps sending. The only rate limiting is HTTP-level
> (200 req/min per IP on `/api/*`, `src/middleware/rate-limit.ts`) which does nothing to protect the
> WhatsApp account, and `BulkMessageService` pacing (`delayMs` default 1000, `randomizeDelay`) which
> is opt-in and bypassed entirely by calling `/api/sendText` directly.

What a real implementation needs — all of it derivable from data already stored:

| Control | Design | Data available |
|---|---|---|
| **Message caps** | Sliding-window counters per session: per minute / hour / day | Count sends in the policy table (or seed from `audit_logs` `MESSAGE_SENT`) |
| **Reachout timelock** | Minimum interval between messages to **distinct new chats** — the actual ban trigger is cold outreach, not volume to existing chats | "New chat" = first outgoing message to that jid. Derivable from the messages store (`jid`, `messageTimestamp`, `fromMe` in `data`) or the chats table (`conversationTimestamp`) |
| **New-contact quotas** | e.g. ≤ N first-time chats per hour/day | same as above |
| **Warmup ramp** | Scale caps by session age (day 1-3 very low, ramp over ~14 days) | Session `createdAt` / first-connect date |
| **Quiet hours** | Block sends in a configured local-time window | config only |
| **Circuit breaker** | Auto-pause a session on repeated `message_failed` / disconnect storms | `audit_logs` `MESSAGE_FAILED`, session status events |
| **Config surface** | Env defaults + per-session override in `SessionConfig.sendingPolicy`, persisted in `.sessions-index.json` like webhooks/proxy | existing config patterns |
| **Enforcement** | HTTP **429** with `Retry-After` and a reason header; audit row (`message_throttled`); optional webhook event | existing error handler + audit |

**One choke point** makes this tractable: every send goes through the session class, and there is
already a decorator precedent (`@Activity()` in `src/core/session/activity.ts`) — a `@Throttled()`
decorator or a check inside `getMessageOptions()` would cover all send paths including bulk and MCP.
Counter state must be **persisted** (restarting must not reset your daily quota), so a small SQLite
table next to `audit.db` is the simple answer.

Rough v1: **~2 focused days** for the policy service, persistence, enforcement, REST surface
(`GET`/`PUT /api/:session/policy`, `GET /api/:session/policy/usage`) and tests.

## Recommended order

```text
1. Fix the round-trips      → wire /send/buttons/reply + parse interactiveResponseMessage   (hours)
2. Add limit validation     → ≤3 buttons, ≤10 rows / ≤3 sections, clear 422 instead of silence
3. Anti-ban policy service  → caps + reachout timelock + warmup + 429 enforcement   (the real value)
4. Carousel                 → the one genuinely missing interactive message type
5. Multi-select + product/order parsing (test-driven; only if the accounts are business ones)
   Skip: Flows, official templates, payments, catalog CRUD
```

## Related

[[Messaging]] · [[Known Gaps and Stubs]] · [[Roadmap]] · [[Templates and Bulk Send]] · [[MCP Tools Reference]] · [[NOWEB Engine]]

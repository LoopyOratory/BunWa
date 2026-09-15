---
type: note
section: features
status: partial
tags: [bunwa, feature, interactive, commerce, gap]
updated: 2026-09-14
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

**Verify with one live tap**, then parse both shapes and expose them as first-class fields
(e.g. `selectedButtonId` / `selectedRowId`) instead of stuffing text into `body`.

## Feasible to add — no Meta infrastructure needed

| Feature | Feasible | Why / how | Effort |
|---|---|---|---|
| **Carousel** (scrollable cards) | ✅ yes | Proto has `interactiveMessage.carouselMessage.cards[]`, and each card is a full `IInteractiveMessage` with its own header/body/footer/`nativeFlowMessage` — so cards with image + buttons are encodable today. **Biggest genuine gap vs the official API.** | ~1 day (DTO + builder + route + MCP tool) |
| **Multi-select list** | ⚠️ experimental | Would be a native flow button named `multi_select` with a sections payload — plain JSON, so encodable; but WhatsApp renders multi-select mainly in business/catalog contexts. Needs a live test on a real account. | ~0.5 day + testing |
| **Single product message** | ⚠️ needs catalog | `productMessage` exists in the proto (`product` snapshot, `businessOwnerJid`, `catalog`). Sending requires a product id from a **real business catalog** — the message is a card linking to an existing catalog entry. | ~0.5 day, only useful for business accounts |
| **Catalog / storefront button** | ⚠️ needs catalog | `interactiveMessage.shopStorefrontMessage` and `.collectionMessage` exist in the proto — a "view catalog" CTA. Same catalog dependency. | ~0.5 day |
| **Receiving carts / orders** | ✅ yes | `orderMessage` exists in the proto; incoming order messages are currently unparsed (same gap as §2 above). Parsing them into a typed event + webhook (`order.received`) needs no business setup. | ~0.5 day |
| **Sending order confirmation** | ⚠️ experimental | `orderMessage` can be constructed, but whether WhatsApp relays an order-details message from a non-business web session is unverified. | test first |

## Not feasible (or not worth it)

| Feature | Verdict | Reason |
|---|---|---|
| **WhatsApp Flows** | ❌ | **No `FlowMessage` type in this proto**, and flows are only *launched* by a native-flow button referencing a `flow_id` created in Meta Business Manager. Responses come back through Meta's encrypted Flow Data API (RSA/AES endpoint you must host) — impossible to make self-contained here. Only "launch an existing flow" is even conceivable, and it cannot be tested without Meta setup. |
| **Official templates** (approved categories, auth/OTP templates, media headers, **labeled prices**) | ❌ | A Cloud-API concept. `templateMessage` in the proto is the legacy HSM shape and cannot be relayed without a Meta-approved template. `LabeledPrice` is not in the proto at all. **Emulate instead:** BunWa already has per-session templates with `{{variables}}` ([[Templates and Bulk Send]]) — render them into normal or interactive messages. |
| **Catalog CRUD via API** | ❌ | Meta Business Management API only; there is no web-protocol path. (Automating WhatsApp Web's catalog UI through WEBJS/Puppeteer is theoretically possible and practically brittle.) |
| **WhatsApp Pay / payments / invoices** | ❌ | Country- and business-gated; `invoiceMessage` exists in the proto but the web protocol is not a supported payment path. |
| **Business profile management** (hours, address, email, website) | ❌ | No Baileys API for business-profile fields; name/status/picture are the only writable profile surfaces ([[Plus Tier]]). |

## Anti-ban tooling — the highest-value addition, and it does not exist

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

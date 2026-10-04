---
type: note
section: reference
tags: [bunwa, openwa, waha, upstream, parity]
updated: 2026-10-04
status: active
source: github.com/rmyndharis/OpenWA commits + releases (fetched via GitHub API, 2026-10-04), devlikeapro/waha releases
---

# 🔭 Upstream Watch — OpenWA and WAHA

Extends [[OpenWA Parity]] (audited 2026-08-22) with what both upstreams shipped since.
Researched 2026-10-04 from the GitHub API. The WAHA deep-dive is tracked separately; WAHA
appears here only where it converges with OpenWA, which it does on one important theme.

Each Port/Action verdict names the kind (small fix, feature, or not portable) and whether it
touches security. Rows marked shipped name the BunWa commit that shipped them.

## Upstream pace

`rmyndharis/OpenWA` shipped **v0.24.0 on 2026-10-03**: the September v0.23.8 train was renamed
and released, and the last 50 commits fetched (2026-10-02 and 2026-10-03) are its final fixes,
most of them send-pacing and Baileys correctness. The release notes are large (retention, media
concurrency, S3 key prefixes, Redis TLS, a metrics endpoint, deeper key scoping and boot
validation) plus a long fix list. Nothing API-breaking for BunWa's clients.

## Comparison: OpenWA → WAHA → BunWa

| # | Upstream feature | OpenWA | WAHA | BunWa | Verdict |
|---|---|---|---|---|---|
| 1 | **Anti-ban: message capping + reachout timelock** | v0.24.0: parallel sends can no longer together exceed the daily or cold-reachout caps, a group create or participant add over the cold allowance answers `400` with the batch size to split into, and `SEND_PACING_COLD_DAILY_CAP=0`/`off` disables the cap; v0.23.8: delivery-failure metrics (`openwa_webhook_delivery_failures_total`), admin-only failure runbook, send-pacing env (`SEND_PACING_ENABLED`) | 2026.8.1: "Message Capping & Reachout Timelock APIs" | ✅ **shipped** (`7a0bd3f`) - `SendingPolicyService` with caps, reachout timelock, new-chat quota, warm-up ramp, quiet hours, 429 + `Retry-After`; group create/add is not gated and admission is check-then-record, so parallel sends can overshoot a cap | **Done (`7a0bd3f`); hardening outstanding (small fix, security: no)** |
| 2 | **Scoped API keys** | v0.24.0: keys gain expiry, allowed IPs and roles, a dashboard editor for session and chat allowlists, `403` instead of `401` for a valid key refused by its allowlists, and a `409` guard so the last unrestricted admin key cannot be revoked or restricted; a scoped key can read messages by allowed `chatId` and get filtered group, contact and label lists; `POST /api/auth/validate` reports `scoped`. v0.23.6: `allowedChats`; v0.23.4: keys scoped to chosen sessions | 2026.7.1: session keys scoped to media/control, read/send | MCP keys are session-scoped, but REST keys are global-admin; no `auth/validate` route | **Port (feature, security); Roadmap #20** |
| 3 | **Structured button replies** | v0.23.6: inbound button/list replies typed `text` with structured `button {id, text}` | — | ✅ **shipped** (`7a0bd3f`) - `interactive {type, selectedId, selectedText, repliedToMessageId}` on every inbound selection | **Done (`7a0bd3f`)** |
| 4 | **Deleted-for-everyone semantics** | v0.23.7: reply/react/edit on a deleted message answers `404`; inbound edits/revokes targeting messages **from other chats are dropped** (security). v0.24.0: a message deleted before it is stored is no longer announced with its content, and an API delete in that window goes out as `revoked` with an empty body | — | ✅ **security half shipped** (`7a0bd3f`) - cross-chat edit/revoke protocol messages are dropped; reply/react on a deleted message still does not answer 404 | **Done (security, `7a0bd3f`); 404 semantics outstanding (small fix)** |
| 5 | **Inbound commerce typing** | v0.23.5: order/product messages typed; v0.24.0: `send-product` passes the plugin gate with type `product`, and Baileys answers `403` instead of `500` on WhatsApp catalog refusals | — | order/product messages unhandled (documented) | **Port (feature, security: no): type them, emit events** |
| 6 | **`sendSticker`** | — | 2026.8.2: shipped properly | ✅ **fixed** (`7a0bd3f`) - the route reads `session` from the body like the sibling send routes | **Done (`7a0bd3f`)** |
| 7 | Sessions `?name=` filter (REST + MCP + SDK) | v0.23.5 | — | ✅ **REST shipped** (`7a0bd3f`) - exact or prefix match; MCP/SDK listing not filtered | Done (REST, `7a0bd3f`) |
| 8 | Message keyset cursor (`after`) + `inlineMedia=false` | v0.23.4 | — | limit/offset only | Port for large chats (feature, security: no) |
| 9 | Role-gated reads: invite codes need OPERATOR; `session.qr` WS event restricted | v0.23.5; v0.24.0 adds ADMIN for setting or clearing a session proxy and OPERATOR for `contacts/check/:number`, with scoped-key list filtering | — | any credential is admin | Port when roles land (feature, security) |
| 10 | Session delete clears statuses and mute/archive/pin state | v0.23.7 | — | config cleared; stored state unverified | Verify ours (small fix, security: no) |
| 11 | Group membership approvals + join-requests API | — | 2026.8.2 | not exposed | Optional (feature, security: no) |
| 12 | Phone-number resolution rules (AR/MX) | — | 2026.9.1 | LID mapping only | Different mechanism (not portable) |
| 13 | Observability: Prometheus + OpenTelemetry | v0.24.0: `GET /api/metrics` exports event-loop delay p99/max, unhandled rejections by kind and queue job counts; v0.23.8: delivery metrics | 2026.8.2 | none, by choice | Reconsider (feature, security: no); Roadmap #19 |
| 14 | Engine hygiene: Chrome for Testing 153, WhatsApp Web build fixes, LID group-list fix | v0.23.5-0.23.7; v0.24.0 Baileys fixes: poll votes, pins, RSVPs, events and round video notes typed instead of `unknown`; reconnect backoff 1 s to 60 s within 5 minutes with `session.reconnect_loop`; chat-state cache evicts least-recently-changed first and dedupes phone/lid chats; auth files written atomically with corrupt `creds.json` quarantined; messages stored and emitted in arrival order | 2026.9.1: many WEBJS fixes | webjs 1.34.7 / puppeteer 24 | Track (feature, security: no) |
| 15 | Plus features merged into free Core | — | 2026.6.1 | our tier flag is cosmetic | No action (not portable) |
| 16 | ChatWoot delivered/read ticks + contact name sync | — | 2026.9.1 | partial: contacts and inbound media sync, tick sync not implemented | Optional (feature, security: no) |
| 17 | `chats/overview` pagination now required (breaking) | — | 2026.5.1 | already limit/offset | No action (converged) |
| 18 | MCP auth via `?x-api-key` query param | — | 2026.4.3 | supported | No action (converged) |
| 19 | Dashboard chat UI (media preview, history) | — | 2026.4.1 | ahead: route restyled as WhatsApp Web, store-disabled state explains itself | No action (BunWa ahead) |
| 20 | **Stored-message retention** | v0.24.0: `MESSAGE_RETENTION_DAYS` deletes stored messages and finished bulk batches at startup and then daily; `0` (default) keeps them forever; above 36500 fails the boot | — | only `AUDIT_RETENTION_DAYS`; stored messages grow unbounded | **Port (feature; privacy)** |
| 21 | **Inbound media flood control** | v0.24.0: `INBOUND_MEDIA_GLOBAL_CONCURRENCY` caps concurrent inbound media downloads across all sessions; a download that waits past `MEDIA_DOWNLOAD_TIMEOUT_MS` arrives with `media.omitted: true` | — | no global cap found in `src/` | **Port (small fix, security: no)** |
| 22 | **S3 key prefix** | v0.24.0: `S3_KEY_PREFIX` (default `media/`) lets deployments with separate databases share a bucket under non-overlapping prefixes | — | no prefix setting found | **Port (small fix, security: no)** |
| 23 | **Fail-fast boot validation** | v0.24.0: dozens of values (rate-limit TTLs, retention windows, timers, booleans, body limits) are validated at boot, and a database migrated by a newer release stops the boot naming the migration | — | driver validation shipped (`3391e17`); the rest are not audited | **Partly done; rest is small fixes (security: yes, fail closed)** |
| 24 | **Log privacy** | v0.24.0: info-level logs no longer carry third-party chat ids or phone numbers; the whatsapp-web.js per-action and automation lines moved to `debug`, and the incoming-call line drops the caller's number | — | not verified in this pass | **Verify ours (small fix; privacy)** |
| 25 | **Webhook header hygiene** | v0.24.0: dashboard webhooks set a signing secret and write-only custom headers; a header the gateway sets itself (`User-Agent`, `X-OpenWA-*`) is refused; non-Latin-1 values and names that differ only in case are rejected `400`, and a custom `User-Agent` is dropped at delivery | — | `customHeaders` exist; delivery filters only `X-WAHA-*` and `Content-Type`, with no charset or duplicate-name validation | **Port (small fix, security)** |
| 26 | **Durable webhook outbox** | v0.24.0: deliveries are recorded before the first attempt and stranded ones replay under the stored idempotency key (at-least-once); retries back off exponentially; a receiver that keeps failing is capped per session | — | inline delivery with bounded retries and audit; no durable outbox | **Port (feature, security: no)** |
| 27 | **Subsystems BunWa does not carry** | v0.24.0: Redis TLS/cache/queue, built-in PostgreSQL/Redis/MinIO containers, plugin registry fixes, data export/import hardening, Helm chart and locales; the image can also start as a non-root uid and the Helm chart sets a pod security context, while BunWa already runs UID/GID 1001 with a read-only root filesystem | not compared here | no Redis, no container management, plugin loader and export/import unwired, no Helm chart or locales | **Intentionally not portable (no action)** |

Sources per row: OpenWA release notes (v0.23.4 to v0.24.0) and the 50 fetched commits
(2026-10-02 to 2026-10-03); WAHA release notes (2026.3.4 to 2026.9.1).

## What BunWa has that upstream does not

Worth remembering both directions: Bun runs it faster and cheaper; an **MCP server with 53
tools** plus session-scoped MCP keys and per-session tool policy (WAHA shipped an MCP app in
2026.4.3; OpenWA has none); templates that are editable, previewable and sendable with server
rendering; HMAC-signed webhooks with idempotency keys and filters; an audit log with
retention; an n8n community node whose trigger **flattens button and list taps into a
`selectedId`** (the upstream plugin cannot read button replies at all); and a chat console
that explains its own store-disabled state.

## Port list, prioritised

```text
1. [done 7a0bd3f] Anti-ban policy service (both upstreams shipped it; Roadmap A1)
   outstanding: group create/add coverage, atomic admission, circuit breaker (A6)
2. [done 7a0bd3f] Structured button ids in the API payload
3. Scoped REST API keys: allowedChats, allowedIps, expiry, roles, 403 semantics (Roadmap #20)
4. [done, security half 7a0bd3f] Cross-chat edit/revoke drop; 404-on-deleted semantics outstanding
5. [done 7a0bd3f] Fix POST /api/sendSticker
6. Order/product message typing
7. [done, REST 7a0bd3f] Sessions ?name= filter; message keyset cursor outstanding
8. Message retention (MESSAGE_RETENTION_DAYS)
9. Webhook header validation (charset, duplicate names, gateway-set headers)
10. Boot validation of the remaining environment values
```

## Related

[[OpenWA Parity]] · [[Interactive Messages and Commerce]] · [[Roadmap]] · [[Known Gaps and Stubs]]

---
type: note
section: reference
tags: [bunwa, openwa, waha, upstream, parity]
updated: 2026-09-29
status: active
source: github.com/rmyndharis/OpenWA commits + releases (fetched via GitHub API, 2026-09-29), devlikeapro/waha releases
---

# 🔭 Upstream Watch — OpenWA and WAHA

Extends [[OpenWA Parity]] (audited 2026-08-22) with what both upstreams shipped since.
Researched 2026-09-29 from the GitHub API. The WAHA deep-dive is tracked separately; WAHA
appears here only where it converges with OpenWA, which it does on one important theme.

## Upstream pace

`rmyndharis/OpenWA` is moving fast: **four releases in September** (v0.23.4 → v0.23.7) plus a
v0.23.8 pre-release train with ~40 commits in the last week alone (pre-release fixes, docs,
tests and CI for a "0.23.8"). Nothing API-breaking in the classic sense, but several items
are directly relevant to BunWa.

## Comparison: OpenWA → WAHA → BunWa

| # | Upstream feature | OpenWA | WAHA | BunWa | Verdict |
|---|---|---|---|---|---|
| 1 | **Anti-ban: message capping + reachout timelock** | v0.23.8: delivery-failure metrics (`openwa_webhook_delivery_failures_total`), admin-only failure runbook, send-pacing env (`SEND_PACING_ENABLED`) | 2026.8.1: "Message Capping & Reachout Timelock APIs" | ✅ **shipped** — `SendingPolicyService` with caps, reachout timelock, new-chat quota, warm-up ramp, quiet hours, 429 + `Retry-After` | **Done** |
| 2 | **Scoped API keys** | v0.23.6: keys gain `allowedChats`; v0.23.4: keys scoped to chosen sessions | 2026.7.1: session keys scoped to media/control, read/send | MCP keys are session-scoped, but REST keys are global-admin | **Port** (Roadmap #20) |
| 3 | **Structured button replies** | v0.23.6: inbound button/list replies typed `text` with structured `button {id, text}` | — | ✅ **shipped** — `interactive {type, selectedId, selectedText, repliedToMessageId}` on every inbound selection | **Done** |
| 4 | **Deleted-for-everyone semantics** | v0.23.7: reply/react/edit on a deleted message answers `404`; inbound edits/revokes targeting messages **from other chats are dropped** (security) | — | ✅ **security half shipped** — cross-chat edit/revoke protocol messages are dropped; reply/react on a deleted message still does not answer 404 | **Done (security); 404 semantics outstanding** |
| 5 | **Inbound commerce typing** | v0.23.5: order/product messages typed | — | order/product messages unhandled (documented) | **Port: type them, emit events** |
| 6 | **`sendSticker`** | — | 2026.8.2: shipped properly | ✅ **fixed** — the route reads `session` from the body like the sibling send routes | **Done** |
| 7 | Sessions `?name=` filter (REST + MCP + SDK) | v0.23.5 | — | ✅ **REST shipped** — exact or prefix match; MCP/SDK listing not filtered | Done (REST) |
| 8 | Message keyset cursor (`after`) + `inlineMedia=false` | v0.23.4 | — | limit/offset only | Port for large chats |
| 9 | Role-gated reads: invite codes need OPERATOR; `session.qr` WS event restricted | v0.23.5 | — | any credential is admin | Port when roles land |
| 10 | Session delete clears statuses and mute/archive/pin state | v0.23.7 | — | config cleared; stored state unverified | Verify ours |
| 11 | Group membership approvals + join-requests API | — | 2026.8.2 | not exposed | Optional |
| 12 | Phone-number resolution rules (AR/MX) | — | 2026.9.1 | LID mapping only | Different mechanism |
| 13 | Observability: Prometheus + OpenTelemetry | 0.23.8: delivery metrics | 2026.8.2 | none, by choice | Reconsider (Roadmap #19) |
| 14 | Engine hygiene: Chrome for Testing 153, WhatsApp Web build fixes, LID group-list fix | v0.23.5-0.23.7 | 2026.9.1: many WEBJS fixes | webjs 1.34.7 / puppeteer 24 | Track |
| 15 | Plus features merged into free Core | — | 2026.6.1 | our tier flag is cosmetic | No action |
| 16 | ChatWoot delivered/read ticks + contact name sync | — | 2026.9.1 | partial: contacts and inbound media sync, tick sync not implemented | Optional |
| 17 | `chats/overview` pagination now required (breaking) | — | 2026.5.1 | already limit/offset | No action |
| 18 | MCP auth via `?x-api-key` query param | — | 2026.4.3 | supported | No action |
| 19 | Dashboard chat UI (media preview, history) | — | 2026.4.1 | ahead: route restyled as WhatsApp Web, store-disabled state explains itself | No action |

Sources per row: OpenWA release notes (v0.23.4 → v0.23.7, 0.23.8 train) and WAHA release
notes (2026.3.4 → 2026.9.1).

## What BunWa has that upstream does not

Worth remembering both directions: Bun runs it faster and cheaper; an **MCP server with 43
tools** plus session-scoped MCP keys and per-session tool policy (WAHA shipped an MCP app in
2026.4.3; OpenWA has none); templates that are editable, previewable and sendable with server
rendering; HMAC-signed webhooks with idempotency keys and filters; an audit log with
retention; an n8n community node whose trigger **flattens button and list taps into a
`selectedId`** (the upstream plugin cannot read button replies at all); and a chat console
that explains its own store-disabled state.

## Port list, prioritised

```text
1. [done] Anti-ban policy service   (both upstreams shipped it; Roadmap A1)
2. [done] Structured button ids in the API payload
3. Scoped REST API keys (allowedChats / per-session)
4. [done, security half] Cross-chat edit/revoke drop; 404-on-deleted semantics outstanding
5. [done] Fix POST /api/sendSticker
6. Order/product message typing
7. [done, REST] Sessions ?name= filter; message keyset cursor outstanding
```

## Related

[[OpenWA Parity]] · [[Interactive Messages and Commerce]] · [[Roadmap]] · [[Known Gaps and Stubs]]

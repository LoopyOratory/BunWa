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
| 1 | **Anti-ban: message capping + reachout timelock** | v0.23.8: delivery-failure metrics (`openwa_webhook_delivery_failures_total`), admin-only failure runbook, send-pacing env (`SEND_PACING_ENABLED`) | 2026.8.1: "Message Capping & Reachout Timelock APIs" | **none** — Roadmap A1 | **Port. Both upstreams converged on this; it is no longer optional.** |
| 2 | **Scoped API keys** | v0.23.6: keys gain `allowedChats`; v0.23.4: keys scoped to chosen sessions | 2026.7.1: session keys scoped to media/control, read/send | MCP keys are session-scoped, but REST keys are global-admin | **Port** (Roadmap #20) |
| 3 | **Structured button replies** | v0.23.6: inbound button/list replies typed `text` with structured `button {id, text}` | — | `body` carries the label; the **id** only surfaces via the n8n trigger's `interactive` field | **Port: expose `selectedId` in the API payload** |
| 4 | **Deleted-for-everyone semantics** | v0.23.7: reply/react/edit on a deleted message answers `404`; inbound edits/revokes targeting messages **from other chats are dropped** (security) | — | not implemented | **Port the security half** |
| 5 | **Inbound commerce typing** | v0.23.5: order/product messages typed | — | order/product messages unhandled (documented) | **Port: type them, emit events** |
| 6 | **`sendSticker`** | — | 2026.8.2: shipped properly | **our route is broken** — 400 on every call (no `:session` path param for its resolver) | **Fix ours** |
| 7 | Sessions `?name=` filter (REST + MCP + SDK) | v0.23.5 | — | no filter | Minor, cheap |
| 8 | Message keyset cursor (`after`) + `inlineMedia=false` | v0.23.4 | — | limit/offset only | Port for large chats |
| 9 | Role-gated reads: invite codes need OPERATOR; `session.qr` WS event restricted | v0.23.5 | — | any credential is admin | Port when roles land |
| 10 | Session delete clears statuses and mute/archive/pin state | v0.23.7 | — | config cleared; stored state unverified | Verify ours |
| 11 | Group membership approvals + join-requests API | — | 2026.8.2 | not exposed | Optional |
| 12 | Phone-number resolution rules (AR/MX) | — | 2026.9.1 | LID mapping only | Different mechanism |
| 13 | Observability: Prometheus + OpenTelemetry | 0.23.8: delivery metrics | 2026.8.2 | none, by choice | Reconsider (Roadmap #19) |
| 14 | Engine hygiene: Chrome for Testing 153, WhatsApp Web build fixes, LID group-list fix | v0.23.5-0.23.7 | 2026.9.1: many WEBJS fixes | webjs 1.34.7 / puppeteer 24 | Track |
| 15 | Plus features merged into free Core | — | 2026.6.1 | our tier flag is cosmetic | No action |

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
1. Anti-ban policy service        (both upstreams shipped it; Roadmap A1)
2. Structured button ids in the API payload
3. Scoped REST API keys (allowedChats / per-session)
4. Deleted-message 404 semantics + cross-chat edit/revoke drop (security)
5. Fix POST /api/sendSticker      (broken here, working upstream)
6. Order/product message typing
7. Sessions ?name= filter, message keyset cursor
```

## Related

[[OpenWA Parity]] · [[Interactive Messages and Commerce]] · [[Roadmap]] · [[Known Gaps and Stubs]]

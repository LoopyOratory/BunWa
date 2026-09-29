---
type: note
section: reference
tags: [bunwa, waha, upstream, parity]
updated: 2026-09-15
source: https://github.com/devlikeapro/waha/releases
status: shipped
---

# 🔭 Upstream Watch — WAHA vs BunWa

Comparison of WAHA's recent releases (2026-03 → 2026-09-22, twelve releases) against this fork,
extending the 2026-08-22 audit in [[OpenWA Parity]]. Checked via the GitHub releases API; the
window starts where the previous audit ended.

## The headline

WAHA merged **Plus into Core** (2026.6.1), shipped an **MCP server** (2026.4.3) and added
**Message Capping & Reachout Timelock** (2026.8.1) — the last of those is the anti-ban feature
[[Roadmap]] flags as the highest-value gap, and upstream has now shipped it. BunWa's advantages
over the same window: a richer MCP surface with per-session policy, an n8n node that can actually
read button taps, and the interactive-envelope fix.

## WAHA update → BunWa status

| WAHA update (release) | BunWa status |
|---|---|
| Message Capping + Reachout Timelock APIs (2026.8.1) | ❌ **missing — build this next.** It is the feature [[Interactive Messages and Commerce]] ranked first, and upstream shipping it validates the design |
| `POST /api/sendSticker` (2026.8.2) | ⚠️ we have the route and it is broken: no `:session` param for its resolver ([[Known Gaps and Stubs]]) |
| Group membership approvals + join-requests API (2026.8.2) | ❌ missing — group settings only cover admin-only info/messages |
| OpenTelemetry traces + Prometheus `/metrics` (2026.8.2) | ❌ missing ([[Roadmap]] #19); observability is health + logs + audit only |
| Auto WhatsApp Web version fetch for NOWEB (2026.8.1) | ❌ missing — we pin Baileys rc14 manually; stale web versions cause disconnect-class bugs |
| Scoped session keys: media/control scopes (2026.7.1), read/send (2026.4.3) | ⚠️ partial — per-session MCP keys exist, but REST keys are all-or-nothing admin ([[Security Model]], [[Roadmap]] #20) |
| LID / phone-number resolution fixes (2026.8.1) | ✅ LID support is first-class ([[Chats Contacts Groups]]), verified live |
| Phone Numbers app, AR/MX number rules (2026.9.1) | ❌ missing — `checkNumberStatus` covers registered-check, no country-specific formatting app |
| ChatWoot delivered/read ticks + contact name sync (2026.9.1) | ⚠️ partial — Chatwoot integration syncs contacts and inbound media; tick sync is not implemented |
| Plus merged into free Core (2026.6.1) | ✅ equivalent — the whole fork is effectively Plus ([[Plus Tier]]) |
| MCP server + `?x-api-key` query auth (2026.4.3) | ✅ ahead — 43 tools with per-session policy vs upstream's app; query-param auth supported |
| `GET /api/{session}/new-message-id` (2026.4.3) | ✅ have |
| `chats/overview` pagination now required (2026.5.1, breaking) | ✅ compatible — limit/offset already implemented |
| `replyTo.media` on all engines (2026.4.1) | ⚠️ partial — `replyTo` is populated and carries media fields; untested with media quotes |
| Dashboard chat UI improvements (2026.4.1) | ✅ ahead — the chat route was restyled to match WhatsApp Web ([[Dashboard]]) |
| n8n | ✅ ahead — our node reads button and list taps as `interactive.selectedId`; the upstream plugin cannot ([[n8n Integration]]) |
| GOWS updates, Passkey pairing, engine bumps (2026.6.x–2026.7.x) | ➖ N/A — no GOWS engine in this fork ([[Engines Overview]]) |

## Actions this implies

1. **Anti-ban APIs (caps + reachout timelock).** Upstream shipped it; the design is already written
   in [[Interactive Messages and Commerce]]. This stops being a differentiator the moment someone
   compares the two feature pages.
2. **`sendSticker`** — fix the session resolution (one line) and the parity table goes green.
3. **Scoped REST keys** — the policy layer is already shaped for it (`CanSession` + `Action`).
4. **Metrics/OTel** — optional, but it is the most requested ops feature we lack.

## Sources

GitHub releases `devlikeapro/waha` (tags 2026.3.4 → 2026.9.1), fetched 2026-09-15. The upstream
docs may carry detail the release notes compress; re-check the linked release bodies when acting
on a row.

## Related

[[OpenWA Parity]] · [[Interactive Messages and Commerce]] · [[Roadmap]] · [[Known Gaps and Stubs]] · [[Dashboard]] · [[n8n Integration]]

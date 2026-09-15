---
type: note
section: development
tags: [bunwa, dev, roadmap]
updated: 2026-09-14
status: active
---

# 🗺️ Roadmap

Candidate work, ordered by (value ÷ effort). Nothing here is committed to — it is a map of the
obvious next moves given the current state.

## Top priority — anti-ban & interactive round-trips

Full analysis in [[Interactive Messages and Commerce]].

| # | Task | Why |
|---|---|---|
| A1 | **Sending policy service** — per-session message caps (min/hour/day), reachout timelock for *new* chats, new-contact quotas, warm-up ramp for fresh sessions, quiet hours, 429 enforcement + retry-after | **the highest-value missing capability.** Nothing caps sending today; the only limiter is HTTP-level and bulk pacing, both bypassable. Cold outreach is what gets Baileys-style sessions banned |
| A2 | **Parse `interactiveResponseMessage`** — incl. `nativeFlowResponseMessage.paramsJson` → expose `selectedButtonId` / `selectedRowId` | button and list taps sent *by this server* currently arrive with an empty body |
| A3 | **Wire `/api/send/buttons/reply`** | it returns success and sends nothing; the engine method exists but has no caller |
| A4 | **Validate interactive limits** — ≤3 buttons, ≤10 list rows / ≤3 sections → clear 422 | over-limit messages are silently dropped by WhatsApp while the API reports success |
| A5 | **Carousel message type** — `interactiveMessage.carouselMessage.cards[]` | the one genuinely missing interactive type that needs no Meta infrastructure |
| A6 | **Circuit breaker** — auto-pause a session on repeated send failures / disconnect storms | stops a flagged session from making things worse |

## Quick wins (hours)

| # | Task | Why |
|---|---|---|
| ~~1~~ | ~~Fix the 2 failing tests~~ | ✅ **done** — 104/104 green ([[Bun Runtime Adoption]]) |
| ~~2~~ | ~~Tighten CI typecheck cap 1049 → 0~~ | ✅ **done** — the cap is gone, CI runs strict `tsc` |
| 3 | **Wire or delete the stub routes** — `contacts/block`·`unblock`, `groups/:id` delete, `events`, `media/convert/video` | four endpoints currently lie in the docs and fail at runtime ([[Known Gaps and Stubs]]) |
| 4 | **Chat mute/unmute** — implement `muteChat`/`unmuteChat` on the NOWEB engine | the routes exist and always 400; NOWEB has the underlying primitive |
| ~~5~~ | ~~Remove the hardcoded `x-api-key: waha`~~ | ✅ **done** — `getApiAuthHeaders()` sends the dashboard Basic credentials plus an optional real key from `localStorage["waha-api-key"]` ([[Dashboard]]) |
| 6 | ~~Declare `sharp` or delete it~~ | ✅ **done** — `sharp` and 7 other unused deps were removed ([[Bun Runtime Adoption]]) |
| 7 | **Drop axios** from `ChatwootAppService` in favour of native `fetch` | one file, ~30 call sites; also removes the last HTTP-client dependency. Was deliberately skipped during the Bun pass to keep behaviour identical |

## Worth doing (days)

| # | Task | Why |
|---|---|---|
| 7 | **Declarative engine capability matrix** — `getEngineInfo()` returning per-engine supported operations | kills the whole class of "500 instead of a clear 422" bugs, and lets the dashboard hide unsupported buttons ([[Engines Overview]]) |
| 8 | **Group MCP tools** — create/participants/settings | the `'group'` tool category already exists with no tools in it ([[MCP Tools Reference]]) |
| 9 | **Label colour mapping** — implement the hex ↔ 0–19 index conversion | three `TODO`s in the engine; labels currently lose their colour ([[Channels and Labels]]) |
| 10 | **`waproto` location/vCard extraction** | outgoing location and vCard payloads are silently empty |
| 11 | **Postgres `runInTransaction`** — real `BEGIN`/`COMMIT` | batch writes are non-atomic today ([[Session Stores]]) |
| 12 | **Generate the OpenAPI document from the routes** (or at least a drift check in CI) | spec says 113 operations, code has 175 ([[API Docs]]) |
| 13 | **`docker-compose.yml`** for the documented self-host path | docs reference one; the repo doesn't have it |
| 14 | **Auto-start the UI's default port correctly** — align `dev.sh`/Vite proxy port | `bun run dev` currently points the UI at a port the API isn't on ([[Runbook]]) |
| 15 | **Delete dead code** listed in [[Known Gaps and Stubs]] §4 | reduces the "is this real?" tax on every new reader |

## Bigger bets (weeks)

| # | Task | Why |
|---|---|---|
| 16 | **Finish or remove the plugin + hook system** — emit the 17 lifecycle hooks, load `plugins/*` | a whole extension architecture exists with zero call sites; either it becomes the plugin story or it goes |
| 17 | **Durable send queue** (SQLite-backed jobs) | bulk batches are in-memory and lost on restart; upstream's Redis/BullMQ path was deliberately not ported — a lighter built-in queue would fit this fork |
| 18 | **Channel message reading** — Argo decoder for `messages/preview`, plus `channelsList` | channel *reading* is the one real capability hole vs upstream |
| 19 | **`/metrics` endpoint** (Prometheus text format) | currently no metrics at all; sessions, messages sent, webhook outcomes and queue depth are the obvious gauges |
| 20 | **Per-key roles / scoped API keys for the REST API** (not just MCP) | today any credential is admin; the policy layer is already shaped for it (`CanSession` + `Action`) |
| 21 | **Media durability option** — configurable local TTL, or S3 by default | 180 s is short for any real integration ([[Data and Storage]]) |
| 22 | **Re-wire or delete the storage/export-import service** | export/import with size caps exists but no route exposes it |

## Suggested order

```text
A1–A4  (anti-ban policy + fix the interactive round-trips — highest value, days not weeks)
  → 3–5  (stop lying in the API surface)
    → A5   (carousel — the missing message type)
      → 7–8  (capability matrix — unlocks cleaner UI + fewer 500s)
        → 16–17  (plugin/hook decision + durable queue = the two structural questions)
```

Recently completed: the whole [[Bun Runtime Adoption|Bun 1.4.2 runtime pass]] (native static serving,
protocol body cap, S3 on Bun, 8 dependencies removed, green test suite, strict CI typecheck).

## Related

[[Known Gaps and Stubs]] · [[Roadmap]] · [[OpenWA Parity]] · [[Fix History]] · [[Testing]]

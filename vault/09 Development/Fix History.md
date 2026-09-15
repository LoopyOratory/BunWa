---
type: note
section: development
tags: [bunwa, dev, history]
updated: 2026-09-14
source: git log
status: shipped
---

# 🕘 Fix History

Recent commit history, grouped by theme — the "what changed and why" that a fresh clone doesn't tell you.
Newest work first within each theme.

## Bun 1.4.2 runtime adoption

See [[Bun Runtime Adoption]] for the full rationale and evidence.

| Change | Detail |
|---|---|
| Native static serving | async `stat` + `Bun.file()` + **ETag/304** + immutable caching for hashed assets; deleted ~40 lines of duplicated MIME maps (Bun infers Content-Type and handles Range natively) |
| Protocol body cap | `maxRequestBodySize: 10 MiB` on `Bun.serve` closes the chunked-request bypass of the old `Content-Length`-only guard; mapped to a clean JSON 413 |
| WebSocket compression | `perMessageDeflate: true` on the event stream (negotiation verified) |
| `Bun.CryptoHasher` | webhook HMAC + idempotency keys + MCP key hashing; byte-identical output, pinned by a new test |
| Media / S3 | `MediaLocalStorage` off sync FS; `S3MediaStorage` on `Bun.S3Client` (drops both AWS SDK packages, `exists()` now a HEAD) |
| Cleanup | `Bun.sleep`, `Bun.gzipSync`/`gunzipSync`, `Bun.randomUUIDv7()` for audit ids, 8 unused deps removed (37 → 29) |
| Quality gates | 2 tsyringe test failures fixed (**104/104 green**), CI typecheck cap 1049 → strict |

## UI modernisation

| Commit | Change |
|---|---|
| `fee40b5` | **chat bubbles** — WhatsApp-green outgoing bubbles, aligned across all four chat themes |
| `0a819e4` | page transitions (`page-in` animation), login split-screen, workers semantic badges |
| `7c4124d` | design tokens, primitives (`StatusBadge`), dashboard modernisation |

See [[Dashboard]] for the resulting design system.

## Session stability

| Commit | Change |
|---|---|
| `7c19e04` | **Baileys `rc13 → rc14`** — fixes QR stuck in `STARTING` (the upgrade that matters most) |
| `0eb3202` | auto-restart-on-stale-connection was **completely broken**; now reconnects (~28 min randomised job) |

## OpenWA parity

| Commit | Change |
|---|---|
| `87b0567` | docs: log the parity audit + new endpoints in `PROJECT.md` |
| `2e437d4` | add OpenWA-parity endpoints (mute/unmute, message media, reactions, sticker, bulk send + batch, session config, force-kill) |

Full detail: [[OpenWA Parity]].

## Boot / packaging

| Commit | Change |
|---|---|
| `497757b` | **Bun 1.4** adopted (`isolated` linker + global store, `engines.bun >=1.4.0`); fresh-clone boot fix (audit dir auto-create); project docs |
| `eece435` | docs: fix stale MCP tool count, document the ffmpeg requirement |
| `e616733` | Plus tier: wire engine, media storage, file serving |
| `b46843d` | replace fabricated `Baileys.uploadMedia` with the real media API |

## Webhooks & status correctness

| Commit | Change |
|---|---|
| `a8097da` | **webhook subscriptions were silently detached after a settings save**; now re-wired |
| `46841f8` | compute audio duration for voice notes/statuses (WhatsApp requires it) |
| `3b144ef` | status: stop swallowing real errors on image/voice/video status (was returning success while failing) |

## Security

| Commit | Change |
|---|---|
| `f76de62` | SSRF protection added to `fetchBuffer` (remote file downloads), redirect-safe |

Plus the pre-existing webhook SSRF guard, HMAC signing and timing-safe compares ([[Security Model]]).

## Tests

| Commit | Change |
|---|---|
| `30ac09c` | register `AuditService` instance in the webhook test (tsyringe TypeInfo error in 10 tests) |
| `21cb433` | isolate session storage from real data during `bun test` |
| `db3ec9d` | dashboard: audit log rows were missing their message and session |

> The same TypeInfo problem still bites `sessions.test.ts` — 2 failures, [[Testing]].

## Channels

| Commit | Change |
|---|---|
| `7c7e346` | `searchChannelsByView/Text` implemented over WhatsApp's private `w:mex` directory API |

## Type-cleanup campaign (~30 commits)

A sustained push from **1049 → 0** TypeScript errors, split by file cluster so each commit stayed
reviewable: `session.noweb.core.ts` (batches at 122→92→46), `session.abc.ts`, `NowebPersistentStore`,
DTO widening, nullable-message handling, the `ChannelRole` enum bug, `clearMessages` last-messages
requirement, label DTOs, boolean-typing clusters, and the SQL/Postgres storage layer (31→0).

Two real bugs surfaced and were fixed along the way:

- `b46843d` — fabricated media upload replaced with the real Baileys API.
- `a2f2f51` / `90dc45a` — `clearMessages` and boolean-typing clusters hid genuine logic errors.

**Consequence:** `bun run typecheck` is now clean, which makes the CI's 1049-error cap obsolete
([[Docker and Deployment]], [[Roadmap]]).

## Related

[[OpenWA Parity]] · [[Roadmap]] · [[Testing]] · [[Dashboard]] · [[Known Gaps and Stubs]]

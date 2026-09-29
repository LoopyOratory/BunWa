---
type: note
section: development
tags: [bunwa, dev, history]
updated: 2026-09-29
source: git log
status: shipped
---

# 🕘 Fix History

Recent commit history, grouped by theme — the "what changed and why" that a fresh clone doesn't tell you.
Newest work first within each theme.

## Postgres store bring-up (2026-09-29)

The Postgres driver had never executed — no deployment, CI job or test touched it. The first run
against a live server (PGlite; [[Postgres on PGlite]]) surfaced two hard blockers, both fixed:

| Change | Detail |
|---|---|
| `pg` driver resolution | knex loads its driver with a bare `require('pg')` evaluated inside its own module directory. Under bun's isolated linker (`bunfig.toml`) that directory lives in the shared cache with no `pg` link — knex does not declare pg as a dependency — so every Postgres session start died with `Cannot find module 'pg'`. Fixed via `src/core/db/knex-postgres.ts`: a `BunPgClient` subclass whose `_driver()` returns the app-imported `pg`; both knex call sites (NOWEB store, template repository) now go through `makePostgresKnex()`. Pinned by `knex-postgres.test.ts`. |
| `messages` upsert target | `.onConflict(['jid', 'id'])` referenced no unique index (only `messages_id_index` is unique), so every message write failed with `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Now `.onConflict('id')` — matching the schema and the SQLite OR-REPLACE semantics. |
| Repeatable verification | `bun run test:postgres` (`scripts/test-postgres.ts`) exercises all seven store repositories + the template repository against any live Postgres; `bun run postgres:dev` starts an embedded PGlite server (PostgreSQL 18.3 in WASM). First full pass: 10/10. |

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

## Infrastructure page: the database switch became real (2026-09-29)

| Item | Detail |
|---|---|
| The trap | The Infrastructure page saved only `WAHA_DB_*` keys, which the runtime never read — picking PostgreSQL silently kept SQLite. Saving now also writes `WAHA_DATABASE_DRIVER` + `WAHA_DATABASE_URL` (derived from the form), and an older build's `WAHA_DB_TYPE=postgres` is honoured as a runtime fallback. |
| New | `POST /api/infra/database/test` — `select version()` round-trip against the posted settings (5s timeout). Dashboard: live "Runtime" badge, password field with reveal toggle, Test connection button. |
| Pitfall found | Launching `bun run src/main.ts` from a cwd other than the repo root compiles without the repo `tsconfig.json` (Bun resolves it from the working directory) and crashes at import time (`reflect-metadata` TypeError in class-transformer). Run from the app directory, like `scripts/start.sh`. |
| Verified | Live 2026-09-29: runtime flips without a restart; a session started after the flip created all seven store tables in Postgres (PGlite); flipping back wrote `store.sqlite3` for the next session; `bun test` 190/0. |

## WEBJS verified end-to-end: two blocking bugs fixed (2026-09-29)

Verifying the WEBJS engine with a real browser on the box surfaced two bugs that made WEBJS
unusable anywhere Chrome isn't at a hardcoded system path.

| Item | Detail |
|---|---|
| Bug 1 — pre-flight ignored env overrides | `getBrowserExecutablePath()` probed only four hardcoded system paths, so `start()` on a WEBJS session threw "requires Chrome/Chromium" even when `CHROME_PATH` pointed at a working binary — the engine read the env vars, the manager did not. Both now resolve through the one helper: `CHROME_PATH` → `PUPPETEER_EXECUTABLE_PATH` → system candidates. |
| Bug 2 — screenshot used a dropped wwebjs accessor | `getScreenshot()` read `client.puppeteer.page`, which whatsapp-web.js removed (≥ 1.31 exposes `pupPage`), so every screenshot failed — masked as `400 Invalid request` by the route. Now reads `pupPage` (legacy fallback kept), and the route returns the engine's real error message. |
| Verified | Start → `SCAN_QR_CODE` in ~15s via `CHROME_PATH` pointing at a local Chromium; `GET /api/:session/screenshot` → real WhatsApp Web PNG (1280×633). Event monitor streamed every `session.status` transition; audit log recorded create/start/QR/stop/delete ([[Audit Log]]). `bun test` 198/0, typecheck + lint clean. |
| Tests | `webjs-chrome-path.test.ts` (env precedence), `webjs-screenshot.test.ts` (`pupPage` + fallback + failure modes) |

## Bun 1.4.2 pin (2026-09-29)

| Item | Detail |
|---|---|
| Pin | Runtime pinned to 1.4.2 across `engines.bun`, `.bun-version`, CI (`setup-bun`), and both Docker images (`oven/bun:1.4.2` / `:1.4.2-slim`); `@types/bun` + `bun-types` bumped to 1.4.2. |
| Orphan cleanup | `--no-orphans` on the production launch: when the server exits it kills its descendants — e.g. a WEBJS session's Chrome (probed both ways: flag on → child killed; off → child survives). |
| Latent test bug | `auth.test.ts` passed only because another test file happened to register `AuditService` into the DI container first; under `bun test --parallel` (fresh globals per file — now the default `test` script) the rejected-key path 500'd instead of 401. It now registers its own instance against a temp dir — same pattern as `sessions.test.ts`. |
| CI hardening | `bun install --frozen-lockfile` and `PUPPETEER_SKIP_DOWNLOAD=true` in the CI job. |
| Verified | On Bun 1.4.2: `bun run test` 198/0 (parallel), typecheck + lint clean, boot smoke test with `--no-orphans` and exit. Lockfile-format analysis and declined candidates: [[Bun Runtime Adoption#Bun 1.4.2 pin (2026-09-29)]]. |

## Dream UI pass (2026-09-29)

| Item | Detail |
|---|---|
| Ask | Console "too serious and boring" → fun, dreamy, eye-candy UI with beautiful animations; every component touched. |
| Palette | Bun-brand tokens: cream light theme (now the default) + plum dark theme; pastel status chips; aurora background; `.text-gradient`. |
| Type | Fredoka + Nunito (`@fontsource-variable`); Oxanium retired. |
| Motion | Stagger/CountUp/celebrate (`dream.tsx`), sliding tab + nav pills (Framer Motion `layoutId`), springy primitives, login orbs, chat send pop; `useReducedMotion` respected. |
| Components | All ui/* primitives restyled; dialogs/sheets/menus softened; shimmer skeletons; pastel rich toasts; login rebuilt with password reveal toggle; sidebar IA regrouped Operate/Tools. |
| Load path | `scripts/build-frontend.sh` → `frontend-dist` (untracked build artifact served by the API). |
| Verified | Build clean; CDP screenshots light/dark + mobile (1440×900@2, 390×844@3); reveal toggle and theme toggle live-checked; `bun run test` 198/0; typecheck + lint clean. |

## Desktop sizing and radius pass (2026-09-29)

| | |
|---|---|
| Ask | "On desktop elements and components are too small and the border radius crops out elements." |
| Root cause | Dream pass kept the original compact density: 28px inputs, `md:text-xs` shrinking text to 12px on desktop, 20px base radius oversized relative to content. |
| Fix | Desktop-only root scale `@media (min-width: 1024px) { html { font-size: 18px } }` so all rem-based tokens grow together; control heights bumped (inputs h-8, selects h-8, badges h-6, tabs h-9, table heads h-11); base `--radius` 1.25rem→1rem; `--card-spacing` pinned to `--spacing(5)`; legacy `text-xs`/`text-[10-11px]` page overrides removed. |
| Mobile | Unchanged: 16px root, compact rhythm preserved. |
| Verified | CDP computed-style audit (root 18px, inputs 36px, card padding 22.5px), zero h-overflow on 6 pages, dialog + select menu inspected, `bun run test` 198/0, typecheck + oxlint clean. |

## Dreamscape v2 (2026-09-29)

| Item | Detail |
|---|---|
| Ask | User rated the first dream pass "3/10", asked for research + a genuinely eye-appealing, dreamy design. |
| Insight | v1's dream was skin-deep: flat cards on a flat page, slab sidebar, aurora trapped inside the content inset so sidebar and content lived in different worlds. |
| Fix | One fixed dreamscape layer behind the whole app (gradient sky + 4 aurora ribbons + bloom + sparkles/bokeh + dark starfield + veil + grain); glass material system (`.glass-card` / `.glass-frost` / `.glass-pop` / `.glass-field`) applied to cards, dock, menus, dialogs, sheets, fields, empty states, chips; floating glass dock (26px radius, 0.75rem inset, blur); bigger display type (stat metrics text-4xl, page titles text-3xl, login headline text-4xl). |
| Blur budget | backdrop-filter only on fixed/sticky/overlay surfaces (dock, page header, menus, dialogs, login card); scrolling cards use translucent gradients (cheap on the 4 GiB box). |
| Build fix | Hand-written `-webkit-backdrop-filter` pairs got collapsed to prefixed-only by LightningCSS (Chromium ignores it → computed none). Standard property only in source now; build autoprefixes. |
| Verified | CDP: dock blur live, gradient glass computed everywhere, zero overflow light/dark/mobile; MiMo vision rate 7.5–9/10 on login/dashboard/sessions/dialog/mobile (was 3/10); flagged polish (empty state, dark contrast) fixed; `bun run test` 198/0, typecheck + oxlint clean. |

## Related

[[OpenWA Parity]] · [[Roadmap]] · [[Testing]] · [[Dashboard]] · [[Known Gaps and Stubs]]

---
type: note
section: development
tags: [bunwa, bun, dev, ops]
updated: 2026-09-29
source: src/main.ts, src/common/security/webhook-signing.ts, src/plus/storage/s3/S3MediaStorage.ts, package.json
status: shipped
---

# ⚡ Bun Runtime Adoption

A pass over the codebase to use **Bun 1.4.2's native APIs** instead of Node.js equivalents — fewer
dependencies, no event-loop-blocking sync FS in request paths, and capabilities the platform already
provides. Everything below was implemented and verified on Bun 1.4.2 (`typecheck`, `lint`,
104/104 tests, live smoke test).

> A note on method: `bun-docs.txt` in the repo root is only the "Welcome to Bun" page, so the
> decisions here were grounded by **probing the actual runtime** (`bun -e '...'` for API existence and
> exact behaviour) rather than by documentation claims. That is also the recommended way to extend
> this work — see [[#Verifying before adopting]].

## What changed

| # | Change | Where | Why / effect |
|---|---|---|---|
| 1 | **Native static serving** — `serveStaticFile()` helper: async `stat`, `Bun.file()` bodies, **ETag + `If-None-Match` → 304**, `immutable` caching for content-hashed assets, `X-Content-Type-Options: nosniff` | `src/main.ts` | Was: sync `statSync`/`existsSync` per request (event-loop blocking) + ~40 lines of duplicated hand-written MIME maps, no validators at all. Content-Type and **Range requests** now come from Bun natively (verified: `Range: bytes=0-6` → `206` + `Content-Range`) |
| 2 | **Protocol-level body cap** — `Bun.serve({ maxRequestBodySize: 10 MiB })` | `src/main.ts` | The `/api/*` guard could only read `Content-Length`, so a chunked upload bypassed it. Verified: an 11 MB chunked POST now returns **413** (previously it would have been read in full) |
| 3 | **413 mapping for the protocol cap** | `src/middleware/error-handler.ts` | Bun throws while the route reads the body; without a mapping that surfaced as a logged "Unhandled error" + 500-shaped path. Now a clean JSON `413` and no error-level log noise |
| 4 | **Per-message deflate for the event stream** — `websocket: { perMessageDeflate: true }` | `src/main.ts` | Verified negotiation: `Sec-WebSocket-Extensions: permessage-deflate; client_no_context_takeover; server_no_context_takeover` |
| 5 | **`Bun.CryptoHasher`** for webhook HMAC, idempotency keys and MCP key hashing | `src/common/security/webhook-signing.ts`, `src/mcp/mcp.server.ts`, `src/mcp/stdio.ts`, `src/api/mcp-config.routes.ts` | Hot paths (every webhook delivery, every MCP request). Output is **byte-identical** to node:crypto — verified by probe and pinned by [[Testing\|`webhook-signing.test.ts`]] so the wire format cannot drift |
| 6 | **`Bun.sleep()`** | `src/utils/promiseTimeout.ts` | Replaces a hand-rolled `Promise`+`setTimeout` |
| 7 | **`Bun.gzipSync` / `gunzipSync`** replacing `node:zlib` stream plumbing | `src/core/export-import.service.ts` | In-memory buffers don't need streams |
| 8 | **`Bun.randomUUIDv7()`** for audit-log primary keys | `src/core/audit/audit.service.ts` | Time-ordered ids append to the right edge of the PK B-tree instead of scattering; verified audit rows carry UUID version 7 |
| 9 | **Async, Bun-native media FS** | `src/core/media/MediaLocalStorage.ts` | Was 14 sync FS calls including per-write `existsSync`/`mkdirSync`; now `fs/promises` + `Bun.write` / `Bun.file().exists()` / `.delete()` |
| 10 | **`Bun.S3Client`** replacing the AWS SDK | `src/plus/storage/s3/S3MediaStorage.ts` | Drops `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Also fixes semantics: `exists()` is now a **HEAD** request, where the old code did a full `GetObjectCommand` — downloading the object just to prove it exists. Verified `presign` produces correct SigV4 URLs against a custom endpoint (path-style for MinIO, virtual-hosted for AWS) |
| 11 | **8 unused dependencies removed** | `package.json` | `@aws-sdk/*` (×2, after #10), `@casl/ability`, `@figuro/chatwoot-sdk`, `axios-retry`, `sharp`, `write-file-atomic`, `yaml`, plus `puppeteer` (never imported directly — `whatsapp-web.js` pins its own). **37 → 29 dependencies**; `bun install` removed 9 packages |
| 12 | **Test suite repaired + extended** | `src/__tests__/` | Registered the `AuditService` instance to fix the two tsyringe failures ([[Testing]]) and added `webhook-signing.test.ts` + `error-handler.test.ts` |
| 13 | **CI typecheck is now a real gate** | `.github/workflows/ci.yml` | The "max 1049 errors" cap became meaningless once the codebase reached 0 errors — it is now a plain `bun run typecheck` |

## Deliberately not adopted (and why)

| Candidate | Why not |
|---|---|
| **`Bun.SQL`** replacing knex/pg | Would mean rewriting the whole Postgres store layer (`store/postgres/*`) off a battle-tested driver. Worth revisiting only as part of a store-layer refactor, not as a runtime-adoption change |
| **`Bun.password`** (argon2id) for MCP keys | The design looks a key up by comparing its hash across sessions; a deliberately-slow KDF would make *every* MCP request expensive. SHA-256 + timing-safe compare stays (trade-off documented in [[Security Model]]) |
| **`fetch` instead of axios** in the Chatwoot app | ~30 call sites using `AxiosInstance` semantics and axios error shapes (`err.response?.status`). A behaviour-risky refactor hiding inside a "use Bun APIs" pass |
| **`bun build --bytecode`** for production | The app selects engines via runtime `require`/dynamic `import` (`webjs`, `plus`), which a bundle must preserve exactly. Docker runs `bun run src/main.ts` directly and startup is already in the milliseconds — little to gain, real risk |
| **`Bun.Glob`** for the plugin loader | The plugin loader is unwired ([[Known Gaps and Stubs]]); no reason to optimise it. Media purge now uses async `readdir`, which is enough |
| **`Bun.YAML`** to replace the `yaml` package | The dependency turned out to be entirely unused — removing it beats swapping it |
| `Bun.escapeHTML` / `Bun.stringWidth` / `Bun.CSRF` / `Bun.CookieMap` | No call sites: the dashboard authenticates with headers/localStorage rather than cookies, so CSRF/cookie tooling has nothing to protect here |

## Verifying before adopting

The pattern used throughout, and worth repeating for any Bun upgrade:

```bash
# 1. Does the API exist in THIS runtime?
bun -e 'console.log(typeof Bun.gzipSync, typeof Bun.S3Client)'

# 2. Does it behave the way you need? Probe it, don't assume.
bun -e 'import {CryptoHasher} from "bun"; import {createHmac} from "crypto";
        console.log(new CryptoHasher("sha256","k").update("x").digest("hex")
                 === createHmac("sha256","k").update("x").digest("hex"))'
```

Behaviour was checked for every load-bearing assumption: HMAC/SHA-256 byte equality, `Bun.file()`
on directories, MIME inference per extension, `presign` against a custom endpoint, Range handling,
`maxRequestBodySize` enforcement, and WebSocket extension negotiation.

Then the end-to-end smoke test (boot the server on a spare port with throwaway storage dirs) asserted
the observable contracts: `200`/`304`/`206`/`413`/`101` statuses, cache headers, the ETag round-trip,
and audit rows with UUIDv7 ids.

## Follow-ups

- **Repeat on the next Bun release**: re-probe rather than trusting release notes, then re-run the
  smoke test — the two guards that matter most are the body cap and the static-file semantics.
- **Consider `Bun.SQL`** only alongside a Postgres store-layer refactor.
- Axios removal in the Chatwoot app remains available as a standalone cleanup ([[Roadmap]]).

## Bun 1.4.2 pin (2026-09-29)

The runtime is now pinned to **1.4.2** everywhere instead of "whatever latest is":

| Surface | Before | After |
|---|---|---|
| `package.json` → `engines.bun` | `>=1.4.0` | `>=1.4.2` |
| `.bun-version` | — | `1.4.2` |
| CI (`setup-bun`) | `bun-version: latest` | `bun-version: "1.4.2"` |
| Docker (both files) | `oven/bun:1` / `:1-slim` | `oven/bun:1.4.2` / `:1.4.2-slim` |
| Types | `@types/bun` 1.3.14, `bun-types` 1.4.0 | both `^1.4.2` |

Adopted in the same pass:

- **`--no-orphans`** on the production launch (`scripts/start.sh`, both Dockerfiles). Probed both ways:
  a Bun process that exits kills its spawned descendants with the flag and leaves them alive without
  it (`sleep` child, `process.exit(0)`). This is the cleanup for a WEBJS session's Chrome when the
  server dies without a clean `client.destroy()`.
- **`bun test --parallel`** as the `test` script — worker processes, fresh globals per file, ≈2.2s.
  It exposed a latent test bug: `auth.test.ts` only passed because another file happened to register
  `AuditService` in the container first; it now registers its own instance
  ([[Fix History#Bun 1.4.2 pin (2026-09-29)]]).
- **CI hardening**: `bun install --frozen-lockfile` + `PUPPETEER_SKIP_DOWNLOAD=true`.

Checked against the 1.4 upgrade checklist on this tree:

- **No native addons** (`find node_modules -name '*.node'` → 0 results) — nothing to rebuild for the
  Node 26.3.0 compat target.
- **Lockfile format**: 1.4.2 reads and writes the repo's existing `bun.lock` (v1) fine — verified with
  `bun install`, `--frozen-lockfile` and `bun add`. Fresh lockfiles get **v2**; migrating this one
  requires a full re-resolution (measured on a scratch copy: **113 version bumps** — hono
  4.12.25→4.13.11, sharp 0.34.5→0.35.5, oxlint 1.69→1.86, …), so it pairs with a deliberate
  dependency refresh, not a runtime pin.

Evaluated and declined (probed, not assumed):

| Candidate | Why not |
|---|---|
| **Bun.WebView** | Replaces simple automation, not whatsapp-web.js — the WEBJS engine needs wwebjs's deep `page.evaluate` bridging and its own persistent session. Not a drop-in. |
| **`Bun.cron`** | Probe returned an in-process `CronJob` object (no crontab entry written). The one scheduled job (audit retention) is deliberately tied to the server lifecycle — timer torn down in `destroy()`, tests rely on that. |
| **HTTP/2 in `Bun.serve`** | h2 without TLS needs prior-knowledge h2c, which browsers don't speak; the app serves cleartext behind a TLS-terminating proxy and has no TLS options wired. |
| **`Bun.write()` streaming a Response to disk** | No call site writes a `Response`/fetch result to disk — media writes are buffers/strings. |
| **WebSocket `pause()` / `resume()`** | The event stream is low-volume and a few clients deep; Bun buffers sends internally. Revisit if a per-chat firehose subscription is ever added. |
| **`install --offline` / `--prefer-offline`** | Docker's layer cache covers warm installs; CI needs the network anyway. |
| Bun.Image · `Bun.markdown` · JSON5 · JSONL | No call sites. |

## Related

[[System Overview]] · [[Testing]] · [[Webhooks]] · [[Plus Tier]] · [[Known Gaps and Stubs]] · [[Fix History]] · [[Roadmap]] · [[Docker and Deployment]]

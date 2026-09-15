---
type: note
section: security
tags: [bunwa, gap, reference]
updated: 2026-09-14
source: whole-repo audit (see each row)
status: gap
---

# ⚠️ Known Gaps and Stubs

The honest list. Everything here was verified against the code — this note exists so nobody
rediscovers it the hard way.

## 1. Routes that can never succeed

These are mounted and documented, but always fail:

| Endpoint | Response | Cause |
|---|---|---|
| `POST /api/contacts/block` · `/unblock` | 500 "not available in NOWEB engine" | handler is a stub, even though the engine has the primitive |
| `DELETE /api/:session/groups/:id` | 500 "not available in NOWEB engine" | stub, though `deleteGroup` exists on the engine |
| `POST /api/:session/chats/:chatId/mute` · `/unmute` | 400 | guards on `typeof session.muteChat === 'function'`; **no engine defines `muteChat`** — so channel mute works, chat mute never does |
| `GET /api/contacts/about` | `{about: ''}` | stub |
| `POST /api/:session/events` | fake `{id, timestamp}` | stub |
| `POST /api/:session/media/convert/video` | placeholder string `'base64-video-data'` | stub |
| `GET /api/:session/channels/:id/messages/preview` | `AvailableInPlusVersion` | Argo decoder missing |
| `GET /api/session/channelsList` (engine method) | `NotImplementedByEngineError` | channel listing not implemented in the engine |
| `POST /api/send/buttons/reply` | 200 `{result: true}` — **sends nothing** | route is a stub; the engine method `sendButtonsReply()` exists (`session.noweb.core.ts:1259`) but has **no caller anywhere** |

## 2. Functional dead ends

| Thing | Reality |
|---|---|
| `src/core/engines/waproto/location.ts` · `vcards.ts` | both extractors **`return null`**, and the NOWEB send path imports them — so outgoing **location** and **vCard** payload fields are always empty |
| Label colour conversion | hex ↔ WhatsApp 0–19 index is faked (`color: label.color as any`) in 3 places with a `TODO`; colours don't round-trip |
| `PostgresStorage.runInTransaction()` | passthrough — calls the callback with no `BEGIN`/`COMMIT`; Postgres batch writes are not atomic |
| GOWS engine | `GowsBootstrap` is an empty class commented "not supported in Bun version"; `getEngine()` maps `GOWS` → NOWEB, `GowsEngineConfigService` is empty |
| WPP engine | enum value only, no directory, no implementation |
| Auto-restart (historical) | was completely broken until commit `0eb3202`; treat staleness guards as recently-established behaviour |
| Incoming native-flow responses | `extractBody()` handles legacy `buttonsResponseMessage`/`listResponseMessage`/`templateButtonReplyMessage` but **not `interactiveResponseMessage`** — which is what taps on the native-flow buttons/lists BunWa actually sends produce. User taps arrive with `body: null` (raw payload still in `_data`). See [[Interactive Messages and Commerce]] |

## 3. Implemented but never wired in

Full subsystems, written and tested in places, with **zero call sites**:

| Subsystem | Files | Note |
|---|---|---|
| Plugin system | `src/core/plugins/plugin-loader.ts`, `plugin.interfaces.ts` | scans `plugins/*/manifest.json`, `enable/disable/unload` — **never instantiated** |
| Hook system | `src/core/hooks/hook-manager.ts` | 17 hook events (session/message/webhook lifecycle), priority ordering, re-entrancy guard — **nothing emits hooks** |
| File storage service | `src/core/storage/storage.service.ts` | local FS or S3, tar.gz export/import with entry/size caps — no routes, no consumers |
| Export/import | `src/core/export-import.service.ts` | as above; `DATA_DIR`, `EXPORT_IMPORT_MAX_BACKUPS` are read by nothing else |
| Postgres media storage | `src/plus/storage/postgres/PostgresMediaStorage.ts` | BYTEA table; factory comment says it is intentionally not connected |
| Postgres / Mongo session auth | `src/plus/storage/{postgres,mongo}/*SessionAuthRepository.ts` | unreachable — `NowebAuthFactoryCore` only supports `LocalStore` |
| App SDK | `src/apps/app_sdk/services/IAppsService.ts` | placeholder `[key: string]: any` class; "apps" are just the Chatwoot integration |
| Global proxy config | `WHATSAPP_PROXY_SERVER*` (5 vars) | getters exist, nothing consumes them ([[Proxy Support]]) |
| Health check service | `src/core/abc/WAHAHealthCheckService.ts` | legacy abstract, unused |
| Old manager abstraction | `src/core/abc/manager.abc.ts`, `EngineBootstrap.ts` | superseded by `manager.core.ts`; the live manager does not extend it |

## 4. Dead code worth deleting

- `src/api/contacts.session.routes.ts` — imported in `api/index.ts` but **never mounted** (2 dead routes).
- `src/core/engines/noweb/PresenceProxy.ts` — never imported.
- `src/core/engines/noweb/rxjs.ts`, `rxjs/operators.ts`, `src/core/abc/rxjs/operators.ts`, `src/utils/reactive/*` — re-export shims with no users.
- `src/core/engines/noweb/store/sql/SqlChatMethods.ts`, `SqlMessagesMethods.ts` — mixins nothing uses.
- `scheduleReadyReconcile()` in the WEBJS engine — defined, never called.
- `validateBody` / `validateQuery` (`src/middleware/validation.ts`) — never applied to a route.
- `sessionResolver()` (non-working variant) — unused.
- `media/IMediaManager` style placeholder interfaces (`ISessionAuthRepository` etc.) — declared as `[key: string]: any` classes.
- `sharp` — declared in `package.json`, **imported nowhere** in `src/`.
- `@tanstack/react-query`, `recharts`, `date-fns` — installed in the frontend, unused ([[Dashboard]]).
- `@casl/ability` — dependency present; authorisation is hand-rolled instead.

## 5. Documentation drift

| Document | Says | Reality |
|---|---|---|
| `README.md` / `docs/PROJECT.md` | docker-compose provided | **no `docker-compose.yml` in the repo** |
| `.github/workflows/ci.yml` | "max 1049 TypeScript errors" | typecheck is **clean (0 errors)** — the cap is a leftover from the type-cleanup campaign |
| `src/swagger.ts` | 113 operations / 96 paths | **175** route definitions (~173 mounted) — [[API Docs]] |
| `docs/PROJECT.md` | "97/97 tests passing" | 97 tests exist; 95 pass, 2 fail for a test-harness reason (below) |
| `.env.example` | documents `WHATSAPP_PROXY_SERVER*` | not consumed by the runtime |
| `WAHA_SQLITE_PATH` getter | documented in `.env.example` | no runtime consumer |

## 6. Test-harness issue (2 failures) — ✅ FIXED

`sessions.test.ts` → *creates a new session* and *deletes a session* used to fail with:

```text
Cannot inject the dependency "dbOrPath" at position #0 of "AuditService" constructor.
Reason: TypeInfo not known for "Object"
```

`manager.core.ts` resolves `AuditService` from the tsyringe container; the test built the app without
registering the instance, so resolution failed and the route 500s. Fixed by registering the instance
against a temp directory in `beforeAll` (same shape as commit `30ac09c`), plus two new test files —
see [[Testing]] and [[Dependency Injection]]. The suite is now **104/104 green**.

## 7. Structural gaps (by design or omission)

- **No capability matrix.** `getEngineInfo()` returns `{}` and is never overridden; routes
  feature-detect ad hoc, which is how section 1 happens. A declarative capability map would let the
  API return "not supported by engine X" instead of 500 ([[Roadmap]]).
- **No durable queue.** Bulk batches are in-memory; upstream's Redis/BullMQ processors were
  deliberately not ported ([[OpenWA Parity]], [[Templates and Bulk Send]]).
- **No group MCP tools** despite a `'group'` tool category existing ([[MCP Tools Reference]]).
- **No metrics/Prometheus endpoint** — observability is health + logs + audit.
- **Media URLs expire (~180 s)** on local storage; only S3 gives durable links.

## Live-verified against the running server (2026-09-15)

Checked through the BunWa **MCP** against a live session (`vivita`, status WORKING, account
"Vivita Shop Support"), read-only. This confirmed some documented behaviour and corrected a few
assumptions:

| Observation | Detail |
|---|---|
| **MCP per-session key policy works** | `SessionList` (the only non-session-scoped tool) is correctly denied to a session-scoped key: `Tool 'SessionList' is not available to a session-scoped key` |
| **Chat ids are LID-based in practice** | `PresenceGetAll` returns `...@lid` ids and inbound message keys carry `addressingMode: "lid"`, while outbound keys use `<number>@s.whatsapp.net`. The API-facing `from` is the LID. Workflows must echo `from` back unchanged instead of constructing `@c.us` ids (the n8n node's help text now says so) |
| **`GET /api/messages` is a routing gap, not a capability gap** | The MCP `ChatGetMessages` returns real history from the per-session store, so the fix for the stub route is to point it at the same engine call |
| **Message payload shape** | Matches the vault: `id` (`true_`/`false_` prefix encodes `fromMe`), `timestamp`, `from`, `fromMe`, `source` (`app` inbound, `api` for sends through BunWa), `body`, `hasMedia`, `ack`/`ackName` (`DEVICE`, `SERVER`), `replyTo`, `reactions`, `_data` (raw Baileys) |
| **`location` / `vCards` always null live** | Confirms the `waproto` stub ([[Messaging]]); the message itself sends fine |
| **`_status` in the session index can be stale** | `SessionGet` reported `status: "WORKING"` while `config._status: "STOPPED"`. The index copy is written on some transitions only, so it must not be used as a status source; read the live status |

## Related

[[Roadmap]] · [[Testing]] · [[Dependency Injection]] · [[API Docs]] · [[OpenWA Parity]] · [[Plus Tier]]

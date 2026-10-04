---
type: note
section: security
tags: [bunwa, gap, reference]
updated: 2026-10-04
source: whole-repo audit (see each row)
status: gap
---

# ⚠️ Known Gaps and Stubs

The honest list. Everything here was verified against the code — this note exists so nobody
rediscovers it the hard way.

## 0. Resolved 2026-10-04: silent driver fallback left the app on SQLite

| Item | Detail |
|---|---|
| Root cause | `WhatsappConfigService.getDatabaseDriver()` returned any non-empty `WAHA_DATABASE_DRIVER` verbatim, and both `NowebStorageFactoryCore` and `TemplateRepositoryFactory` treated every value other than `postgres`/`postgresql` as SQLite. A misspelling (`pg`, `postgresq`), `mongo` (advertised in the README at the time), or an unknown `WAHA_DB_TYPE` therefore ran SQLite with no log line saying so. Postgres schema creation was also lazy (session start / first template read) and `TemplateService` swallowed a failed init (`this.ready.catch(() => {})`), so failures surfaced as request errors, not startup errors. |
| New behaviour | Unknown drivers and unknown `WAHA_DB_TYPE` values throw at startup naming the accepted values (`sqlite`, `postgres`, `postgresql`) and the value received; `mongo` reports "MongoDB is not implemented". There is no fallback to SQLite. Boot logs one `Storage: driver=...` line with the driver and each store's concrete target (Postgres password redacted), then `verifyStorageAtBoot()` connects and creates the session store and templates schema before serving; a bad URL or database exits with the real error. `TemplateService.init()` is retryable and logs failures at error level. |
| Verified | `src/__tests__/storage-driver.test.ts` (accepted/misspelled drivers, redaction, eager SQLite schema, guarded `BUNWA_TEST_POSTGRES_URL` integration) and live boot checks on SQLite, local Postgres 18, an unreachable URL and a `pg` typo. |

README driver tables corrected in the same round (2026-10-04): they now list `sqlite`, `postgres`
and `postgresql`, state that any other value (including `mongo`) fails the boot, and describe the
`Storage:` report line and the fail-fast verification. `.env.example` already matched.

## 0.1 Resolved 2026-10-04: two label association driver divergences

Found by the SQLite/Postgres conformance suite and fixed the same day.

| Item | Detail |
|---|---|
| SQLite chat label association delete was a no-op | `SqlLabelAssociationsMethods.deleteOne()` always put `messageId: association.messageId \|\| null` into the delete filters. A chat association has no `messageId`, so the statement filtered `"messageId" = NULL`, which never matches a row in SQL: the call reported success and removed nothing. The shared method now branches on the association type. A chat association deletes by type, `chatId` and `labelId`; a message association adds `messageId`. |
| Postgres `getAssociationsByChatId()` ignored the association type | The Postgres repository filtered only on `chatId`, so message associations that share the chat id were returned next to chat associations, while SQLite filters on `label_jid`. `getChatLabels()` therefore reported message level labels as chat labels on Postgres. Postgres now filters `type = label_jid`, matching the SQLite contract. |

Both fixes are pinned by `src/__tests__/conformance/conformance.shared.ts` (the
"label associations: deleteOne removes its own row and is idempotent" case), which runs against
both drivers.

## 0.2 Resolved 2026-10-04: endpoint drill on NOWEB (`vivita`)

Live drill against the running NOWEB engine, plus fixes for what it found.

| Item | Detail |
|---|---|
| NOWEB store was reused after close | `stop()` and `failed()` closed the store but kept the reference, so the next `buildClient()` reused a storage handle whose Postgres knex pool was destroyed: every query failed with "Unable to acquire a connection" and surfaced as a 500 (reproduced live on `POST /api/sendText` after the session dropped). A `closeStore()` helper now closes and drops the reference, used by `stop()`, `failed()` and `clearAuthAndRestart()`; `buildClient()` also re-ensures the store before binding when a concurrent stop dropped it. Pinned by `src/__tests__/noweb-store-lifecycle.test.ts`. |
| Sends on a disconnected session answered 500 | The body-session middleware (`getSessionFromBody`) resolved any session without the working guard. It now uses `getWorkingSession`, so sends and block/unblock answer 404 for an unknown name and 422 naming the status when the session exists but is not WORKING. Pinned in `src/__tests__/session-guard.test.ts`. |
| Screenshot flattened the engine's 422 into a 400 | The route caught every error and answered 400. Client-facing errors now rethrow, so a non-chrome engine answers 422 "Can not get screenshot for non chrome based engine." while WORKING; in QR state the engine returns the QR image. |
| `DELETE /api/:session/groups/:id` was a hardcoded 500 | Now delegates to `engine.deleteGroup` (leave plus local cleanup); engines without the primitive answer 422 through the shared handler. |
| Bulk send delivered nothing | The route wired `BulkMessageService` to `session.sendTextMessage` / `sendImageMessage` / ... methods that no session class defines, so every recipient failed while the batch reported 201. Delegates now call the request-shaped engine methods, the batch is keyed and labelled by `session.name` instead of the always-missing `sessionId`, and image/video/audio/document content (base64 or URL) dispatches to the matching sender. Pinned by `src/__tests__/bulk-and-vcard.test.ts`. |
| `sendFile` dropped declared metadata | `{ mimetype, filename, data }` inputs were reduced to raw bytes, so every document went out as `application/pdf` named "file". The declared `mimetype`/`filename` are carried onto the Baileys message. |
| vCard fields were empty | `toVcardV3` read `name`/`phone`, but the API documents `fullName`/`phoneNumber`; the sent vCard had empty FN and TEL. Both spellings are accepted and `organization` is emitted as ORG. |

## 1. Routes that can never succeed

These are mounted and documented, but always fail:

| Endpoint | Response | Cause |
|---|---|---|
| `POST /api/contacts/block` · `/unblock` | 500 "not available in NOWEB engine" | handler is a stub, even though the engine has the primitive |
| `POST /api/:session/chats/:chatId/mute` · `/unmute` | 400 | guards on `typeof session.muteChat === 'function'`; **no engine defines `muteChat`** — so channel mute works, chat mute never does |
| `GET /api/contacts/about` | `{about: ''}` | stub |
| `GET /api/:session/chats/:chatId` | `{id}` only | stub, no chat data is read |
| `DELETE /api/:session/chats/:chatId` | `{result: true}` | no-op stub, nothing is deleted |
| `GET /api/:session/groups/:id/picture` | `{url: null}` | stub, no group picture is read |
| `GET /api/:session/channels/search/views` · `/countries` · `/categories` | `[]` | hardcoded empty-array stubs |
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
| Incoming native-flow responses | **Corrected by live evidence:** tapping a native-flow `quick_reply` button comes back as `templateButtonReplyMessage` (with `selectedId` and `selectedDisplayText`), which `extractBody()` already parsed, so reply buttons round-trip correctly. All four response shapes (incl. `interactiveResponseMessage`) now also surface a structured `interactive` field on the message payload and are covered by tests (`interactive-replies.test.ts`). Note the reply arrives from the chat LID, not the `@c.us` id it was sent to. See [[Interactive Messages and Commerce]] |

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
| **`GET /api/messages` was a routing gap, not a capability gap** | The MCP `ChatGetMessages` returns real history from the per-session store; the flat REST route is now wired to the same engine call as `GET /api/{session}/chats/{chatId}/messages` (session from query or body, `chatId` required) |
| **Message payload shape** | Matches the vault: `id` (`true_`/`false_` prefix encodes `fromMe`), `timestamp`, `from`, `fromMe`, `source` (`app` inbound, `api` for sends through BunWa), `body`, `hasMedia`, `ack`/`ackName` (`DEVICE`, `SERVER`), `replyTo`, `reactions`, `_data` (raw Baileys) |
| **`location` / `vCards` always null live** | Confirms the `waproto` stub ([[Messaging]]); the message itself sends fine |
| **`_status` in the session index can be stale** | `SessionGet` reported `status: "WORKING"` while `config._status: "STOPPED"`. The index copy is written on some transitions only, so it must not be used as a status source; read the live status |

## Live endpoint drill (2026-10-04, NOWEB `vivita`)

Verifier passes matched the recorded baseline before the incident: read pass `50 works, 3 needs a
parameter, 13 not applicable, 4 error` (the 4 are client-side 15 s timeouts on dummy ids), write
pass exercised templates, webhook create/delete, policy and `sendText` with the safe chat.

| Observation | Detail |
|---|---|
| Session unlinked mid-drill | At 17:16 UTC WhatsApp closed the stream with `conflict/device_removed` (401) during the drill. The app cleared auth as designed and the owner re-paired `vivita`; no logout/stop/delete call was made. The `POST /api/groups` in flight answered 500 after a 30 s "Invalid group metadata response: missing `<group>` node" — that was a BunWa bug, not the unlink (next row). |
| Group mutations exercised live | After re-pairing, 25 calls across create, get, participants v1 and v2, picture, subject, description, both security settings (toggle and read back), invite code get/revoke/rotate, promote, demote, remove, add, count and refresh all answered 2xx. The throwaway group ("BunWa Drill", `120363416106788489@g.us`, safe number as the only other participant) was left standing so the actions can be seen on the phone. Channel follow/unfollow remains unexercised: no real channel id was obtainable. |
| Group participants contract | `CreateGroupRequest.participants` is `string[]`, but the NOWEB engine read every entry as an object with an `id`, so a string entry became `undefined` and Baileys sent a malformed group IQ (the 30 s timeout above). Fixed on both engines through a shared `participantId` reader, with a 400 naming the expected form for a malformed entry. The dashboard's `createGroup(session, name, participants: string[])` was affected by the same bug. |
| Group detail shape | `GET /groups/:id` returned raw Baileys metadata on NOWEB (`desc`, `announce`, `restrict`, participants without `role` or `pn`) and a different private shape on WEBJS. Both engines now answer `GroupInfo`; participant phone numbers left out of the metadata are resolved through the LID mapping, usernames are carried through, and `membersCanSendMessages` is the inverse of `announce` (it used to report `announce` itself). Verified live: description present, `pn: 233553919737@c.us`, `role: superadmin`, usernames `king_kow` and `vivita_store`. |
| Webhook delivery | Verified with a local sink and `SSRF_ALLOWED_HOSTS=127.0.0.1` for the drill only: payload, `X-WAHA-*` headers, custom header and the HMAC-SHA256 signature all arrived. Triggered with `POST /webhooks/:id/test` because a send was impossible; after delete, deliveries stopped. Without the variable the same target is refused 422 "Blocked internal address: 127.0.0.1". |
| `GET /api/infra/config` reports the defaults, not the running overrides | The live instance runs Postgres and `.dev-data/media`, but the endpoint returned `type: sqlite` and `localPath: ./data/media`. Not fixed in this round. |
| Profile picture lookups stall 30 s on unresolvable ids | Fixed 2026-10-04: the lookup is bounded at 5 s, `status@broadcast` is answered without a query, and an unresolved id is remembered for 10 minutes, so a dashboard page that asks for one picture per contact no longer stalls. Live timings after the fix: `status@broadcast` 1.7 ms, a resolvable LID 0.25 s. |
| Channel directory and subscriptions exercised live | Listing answers the subscribed channels, create/get/delete work (a channel created without a picture used to crash the response parser), and follow, mute, unmute and unfollow all answer 200 on a real channel found through search, with the account's subscription state restored afterwards. `by-text` search returns real channels; `by-view` is refused by WhatsApp's GraphQL with 400 for every view value tested, and the three facet routes stay `[]` stubs, so there is no way to discover valid view values. |
| Unfetchable media answered a bare 500 | A file URL the remote host refuses, and a voice note that needs ffmpeg on a host without it, now answer 422 naming the cause. Voice notes that are already Ogg/Opus send without ffmpeg. |
| Status audience | Status text/image/voice/video were sent with `contacts: [safe number]` only and deleted afterwards; the safe number plus the account itself were the only viewers. |

## Related

[[Roadmap]] · [[Testing]] · [[Dependency Injection]] · [[API Docs]] · [[OpenWA Parity]] · [[Plus Tier]]

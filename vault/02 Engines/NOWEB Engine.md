---
type: note
section: engines
tags: [bunwa, engine, noweb, baileys]
updated: 2026-09-14
source: src/core/engines/noweb/
status: shipped
---

# 🌐 NOWEB Engine

The default and fully-featured engine: **`WhatsappSessionNoWebCore`** in
`src/core/engines/noweb/session.noweb.core.ts` (≈3 640 lines), built on
`@whiskeysockets/baileys` **7.0.0-rc14**. It speaks the WhatsApp Web multi-device protocol directly —
no browser, no DOM, no Chrome.

> `rc14` matters: rc13 could get stuck in `STARTING` and never surface a QR. The upgrade was
> commit `7c19e04`. If QR codes hang, check the Baileys version first.

## Files

| File | Role |
|---|---|
| `session.noweb.core.ts` | the engine — socket, lifecycle, and the entire WhatsApp operation surface |
| `NowebAuthFactoryCore.ts` | builds the auth state; **only supports `LocalStore`** (throws for anything else, so the Plus Postgres/Mongo auth repos are unreachable here) |
| `useMultiFileAuthState.ts` | Bun-tuned multi-file auth: preloads every key file into a `Map` via `Bun.file`, writes under an `AsyncLock` |
| `noweb.newsletter.ts` | channels/newsletters — metadata mapping + manual directory search |
| `noweb.buttons.ts` | builds the `biz`/`interactive`/`native_flow` binary nodes for buttons & lists |
| `groups.noweb.ts` | pure mappers for group info, participants and group events |
| `labels/LabelAssociationType.ts` | `label_jid` vs `label_message` association enum |
| `PresenceProxy.ts` | ⚠️ dead code, never imported |
| `types.ts` / `utils.ts` | `Agents {socket, fetch}` proxy agents, media extraction, JID helpers |
| `rxjs.ts`, `rxjs/operators.ts` | ⚠️ unused re-export shims |
| `store/` | persistence layer — see [[Session Stores]] |

## Socket construction

```text
buildClient()
  └─ ensureStore()                    → persistent or in-memory ([[Session Stores]])
  └─ makeSocket()
       ├─ NowebAuthFactoryCore.buildAuth(sessionStore, name)   → useMultiFileAuthState
       ├─ makeCacheableSignalKeyStore(...)                     → signal keys
       └─ makeWASocket(getSocketConfig(...))
  └─ event fixers → connectStore() → listenConnectionEvents() → subscribeEngineEvents2()
```

Notable socket options (`getSocketConfig()`):

- **Browser spoofing** via `Browsers.macOS(...)`-style values driven by
  `sessionConfig.client.browserName` / `deviceName` (env defaults `WAHA_CLIENT_BROWSER_NAME`,
  `WAHA_CLIENT_DEVICE_NAME`).
- `syncFullHistory` from `noweb.store.fullSync`; `markOnlineOnConnect` from `noweb.markOnline` (default `true`).
- 30 s query and keepalive timeouts, retry caches.

## Resilience

| Mechanism | Behaviour |
|---|---|
| `restartClient()` | reconnect after a 2 s delay |
| Auto-restart job | periodic reconnect every ~28 min (`AUTO_RESTART_AFTER_SECONDS`, randomised) — this was completely broken before commit `0eb3202` |
| `clearAuthAndRestart()` | on `loggedOut`: deletes `*.json` from the session dir, resets auth state, issues a fresh QR |
| `unpair()` | `sock.logout()` then the session is deleted |
| `stop()` | saves creds, detaches events, closes media manager → socket → store → auth store |

`StatusTracker` drives `STARTING → SCAN_QR_CODE → WORKING/FAILED`, and the manager mirrors the
transitions into the audit log.

## What NOWEB can do

Everything the API exposes, effectively:

- **Messaging** — text, image, file, voice, video, location, contact vCard, poll + vote, buttons
  (`sendButtons`), list (`sendList`, native-flow node built inline), link preview + custom preview,
  event messages, call reject; plus edit, delete, star, pin/unpin, reactions.
- **Chats** — list, overview, archive/unarchive, unread, delete, clear, history read.
- **Groups** — full CRUD, participants add/remove/promote/demote, subject/description/picture,
  settings (admin-only info, admin-only messages), invite code get/revoke.
- **Channels** — create/get/list/delete, follow/unfollow, mute/unmute, messages, and **directory
  search** (`searchChannelsByView` / `ByText`) implemented by hand: Baileys has no directory API, so
  the engine sends a `w:mex` binary node query with `query_id` `6190824427689257` (list) /
  `6802402206520139` (search) and paths `xwa2_newsletters_directory_list` / `_search`.
- **Status / stories** — text, image, voice, video, delete, with batched broadcast + retry.
- **Presence** — set/get, subscribe, auto-online maintenance.
- **Contacts** — get, list, about, upsert, LID-aware `checkNumberStatus`.
- **LID** — full mapping support: `getSessionMeInfo()` returns `{id, pushName, lid}`;
  `getAllLids`, `getLidsCount`, `findPNByLid`, `findLIDByPhoneNumber` delegate to the store;
  `NowebPersistentStore.handleLidPNUpdates()` keeps the map fresh from `lid-mapping.update`,
  contacts, groups, history and messages. `@lid` JIDs are preserved as-is end to end.
- **Media download** — `downloadMedia` → `NOWEBEngineMediaProcessor` → Lottie pass-through →
  `MediaManager.processMedia`.

## Events emitted

`subscribeEngineEvents2()` wires Baileys events onto the session bus: `ENGINE_EVENT`, `MESSAGE`,
`MESSAGE_ANY`, `MESSAGE_REVOKED`, `MESSAGE_EDITED`, `MESSAGE_REACTION`, `MESSAGE_ACK`,
group join/leave/update/participants, `SESSION_STATUS`, `PRESENCE_UPDATE`, `CALL_RECEIVED`, poll
votes. See [[WebSocket Events]].

## Known rough edges

- **Label colours**: the hex ↔ WhatsApp 0–19 index conversion is faked (`color: label.color as any`)
  in three places — a `TODO` in the engine.
- `channelsList` throws `NotImplementedByEngineError`; `previewChannelMessages` throws
  `AvailableInPlusVersion` because the Argo decoder is missing.
- Location and vCard extraction helpers live in `src/core/engines/waproto/` and both
  `return null`, so those fields are empty in outgoing payloads ([[Known Gaps and Stubs]]).

## Related

[[Engines Overview]] · [[Session Stores]] · [[Messaging]] · [[Channels and Labels]] · [[WebSocket Events]] · [[Proxy Support]]

---
type: note
section: engines
tags: [bunwa, engine, architecture]
updated: 2026-11-24
source: src/core/session/session.abc.ts, src/core/manager.core.ts, src/structures/enums.dto.ts
status: shipped
---

# 🔌 Engines Overview

A "session" is one WhatsApp account. Each session picks an engine — the thing that actually talks
to WhatsApp — and both engines coexist in the same process, even on the same account set.

| Engine | Library | Transport | Weight | Status |
|---|---|---|---|---|
| **BUNWEB** (default; legacy input `NOWEB`) | `@whiskeysockets/baileys` 7.0.0-rc14 | WhatsApp Web WebSocket protocol (Signal E2E) | light, no browser | ✅ the main path |
| **WEBJS** | `whatsapp-web.js` + Puppeteer | headless Chrome driving web.whatsapp.com | heavy | ✅ chat + **voice calls**; narrower surface |
| GOWS | — | — | — | ⚠️ stub — `GowsBootstrap` is empty ("not supported in Bun version"); the enum value and `SessionConfig.gows` exist but `getEngine()` maps GOWS → BUNWEB |
| WPP | — | — | — | ⚠️ enum value only, no implementation |

> Engine code lives in `src/core/engines/bunweb/` with `Bunweb*` class names; the id `NOWEB` is
> still accepted at every input point and normalized to `BUNWEB`.

## The contract

Every engine extends the abstract `WhatsappSession` in `src/core/session/session.abc.ts`.

**Abstract — an engine *must* implement these:**

```text
start()                 stop()                  getScreenshot()
checkNumberStatus()     sendText()              sendLocation()
forwardMessage()        sendImage()  sendFile() sendVoice()
reply()                 sendSeen()              startTyping() / stopTyping()
setReaction()           readChatMessages()      fetchContactProfilePicture()
```

**Concrete base methods** cover everything else — chats, groups, labels, contacts, presence,
channels, statuses, LID mapping, profile, buttons/lists, calls — and by default throw
`NotImplementedByEngineError`. **An engine overrides only what it supports**, and the base class is
therefore also the de-facto capability manifest.

The base class additionally provides: the status `BehaviorSubject`, the per-event observable bus
(`events2` + `SwitchObservable`), QR handling (`printQR`, `qr`), `mediaManager`, `proxyConfig`,
`sessionConfig`, `getSessionMeInfo()`, `maintainPresenceOnline()` (auto-online timer honoured by the
`@Activity()` decorator) and `resolveMentionsAll()`.

## How an engine is chosen

`SessionManager.getEngine()` in `src/core/manager.core.ts`:

```text
sessionConfig.engine === 'WEBJS'  ─►  engines/webjs/session.webjs.core   (Chrome binary pre-checked)
VERSION.tier === PLUS             ─►  plus/session.bunweb.plus          (BUNWEB + picture/media extras)
otherwise                         ─►  engines/bunweb/session.bunweb.core (WhatsappSessionBunWebCore)
```

The default comes from `WHATSAPP_DEFAULT_ENGINE` (`BUNWEB`). Any unrecognised value degrades to
BUNWEB rather than failing.

## Capability map

`getEngineInfo()` is implemented by both engines and returned as `engine` by `GET /api/:session`.
Clients can hide a feature the engine does not support instead of discovering it through a 422.

```text
BUNWEB  text media voiceNotes buttons lists polls groups channels labels
        status presence lid mediaStorage        calls: false
WEBJS   text media voiceNotes groups presence calls mediaStorage
                                                buttons/lists/polls/channels/labels/status/lid: false
```

Routes still feature-detect where a capability is finer-grained (for example block/unblock on
WEBJS), and the two engines are **not** at parity — the honest detail lives in
[[WEBJS Engine#Verified capability]] and [[Known Gaps and Stubs]]. The gaps that still return an
error are deliberate and documented:

| Endpoint | Behaviour | Why |
|---|---|---|
| `POST /api/contacts/block` · `/unblock` | 422 on WEBJS | whatsapp-web.js has no block primitive wired in the engine |
| `DELETE .../groups/:id` | delegates to the engine; 422 where unsupported | `deleteGroup` exists on BUNWEB only |
| `POST .../chats/:chatId/mute` · `/unmute` | works on both engines | BUNWEB uses `chatModify`, WEBJS `muteChat`/`unmuteChat` |
| `POST /api/sendPollVote` | 422 on every engine | votes must be encrypted and Baileys only ships the decrypt side |

Full list in [[Known Gaps and Stubs]].

## Plus tier vs Core

Tier is detected at import time (`src/version.ts`): `WAHA_VERSION=CORE` forces Core; otherwise the
existence of `src/plus/` ⇒ Plus (and the last-resort fallback is Plus too). The engine-level
difference is small and lives in `src/plus/session.noweb.plus.ts`:

- `setProfilePicture` / `deleteProfilePicture` — Core throws `AvailableInPlusVersion`
- `uploadMedia()` — used so `sendButtons` can carry a header image

Everything else in `src/plus/` is storage (S3 media) or unwired repositories. See [[Plus Tier]].

## Related

[[NOWEB Engine]] · [[WEBJS Engine]] · [[Session Stores]] · [[Proxy Support]] · [[Plus Tier]] · [[System Overview]]

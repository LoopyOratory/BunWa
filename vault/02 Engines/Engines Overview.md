---
type: note
section: engines
tags: [bunwa, engine, architecture]
updated: 2026-09-14
source: src/core/session/session.abc.ts, src/core/manager.core.ts, src/structures/enums.dto.ts
status: shipped
---

# 🔌 Engines Overview

A "session" is one WhatsApp account. Each session picks an engine — the thing that actually talks
to WhatsApp — and both engines coexist in the same process, even on the same account set.

| Engine | Library | Transport | Weight | Status |
|---|---|---|---|---|
| **NOWEB** (default) | `@whiskeysockets/baileys` 7.0.0-rc14 | WhatsApp Web WebSocket protocol (Signal E2E) | light, no browser | ✅ the main path |
| **WEBJS** | `whatsapp-web.js` + Puppeteer | headless Chrome driving web.whatsapp.com | heavy | ✅ works, narrower surface |
| GOWS | — | — | — | ⚠️ stub — `GowsBootstrap` is empty ("not supported in Bun version"); the enum value and `SessionConfig.gows` exist but `getEngine()` maps GOWS → NOWEB |
| WPP | — | — | — | ⚠️ enum value only, no implementation |

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
VERSION.tier === PLUS             ─►  plus/session.noweb.plus           (NOWEB + picture/media extras)
otherwise                         ─►  engines/noweb/session.noweb.core  (WhatsappSessionNoWebCore)
```

The default comes from `WHATSAPP_DEFAULT_ENGINE` (`NOWEB`). Any unrecognised value degrades to NOWEB
rather than failing.

## Capability flags — there are none

> ⚠️ There is **no** formal capability matrix and **no** `supports` flag. `getEngineInfo()` exists on
> the base class, returns `{}`, and is never overridden.

Routes feature-detect ad hoc, which produces a few permanently-broken endpoints:

| Endpoint | Behaviour | Why |
|---|---|---|
| `POST /api/contacts/block` · `/unblock` | always 500 "not available in NOWEB" | stubbed even though NOWEB has the primitive |
| `DELETE .../groups/:id` | always 500 "not available in NOWEB" | stub, though `deleteGroup` exists |
| `POST .../chats/:chatId/mute` · `/unmute` | always 400 | guards on `typeof session.muteChat === 'function'`, which no engine defines |

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

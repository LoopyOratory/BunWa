---
type: note
section: engines
tags: [bunwa, engine, webjs, puppeteer]
updated: 2026-09-14
source: src/core/engines/webjs/session.webjs.core.ts, src/core/session/session.browser.ts
status: partial
---

# 🖥️ WEBJS Engine

**`src/core/engines/webjs/session.webjs.core.ts`** (≈960 lines) drives a real headless Chrome through
`whatsapp-web.js` → `web.whatsapp.com`. Heavier and narrower than [[NOWEB Engine|NOWEB]], but it is
the fallback for edge cases where the raw Baileys protocol doesn't cover what you need.

Pick it per session with `engine: "WEBJS"` (or `WHATSAPP_DEFAULT_ENGINE=WEBJS`).

## Requirements

- **A Chrome/Chromium binary.** Resolution order: `CHROME_PATH` → `PUPPETEER_EXECUTABLE_PATH` →
  `/usr/bin/google-chrome`. The manager **checks the path exists before starting** and fails fast
  if it doesn't.
- The Docker images set `PUPPETEER_SKIP_DOWNLOAD=true`, so WEBJS users must mount a Chrome binary
  into the container ([[Docker and Deployment]]).
- `sessionConfig.webjs.authTimeout` controls the pairing-code timeout.

## Lifecycle

```text
start()  →  buildClient()
              new Client({
                authStrategy: new LocalAuth({ clientId: name, dataPath: <cwd>/.sessions/webjs }),
                puppeteer:    { headless, args, executablePath: CHROME_PATH },
              })
              client.initialize()
stop()   →  client.destroy()
unpair() →  client.logout()
```

Events bridged onto the WAHA event bus: `qr`, `authenticated`, `auth_failure`, `ready`,
`disconnected`, `message`, `message_create`, `message_ack`, `group_join`, `group_leave`,
`presence_changed`. Pairing codes come from `client.requestPairingCode()`.

> ⚠️ Session data goes to a **hardcoded** `<cwd>/.sessions/webjs` (`WEBJS_SESSIONS_DIR`), ignoring
> `WAHA_LOCAL_STORE_BASE_DIR` — the NOWEB manager's base dir does not apply here. If you relocate
> session storage, WEBJS will not follow.

## Supported operations

| Area | Supported |
|---|---|
| Messages | text, image, file, voice, video, location, forward, reply, `sendSeen`, typing, reactions, `deleteMessage` |
| Chats | get chats, get chat messages / single message, `readChatMessages`, `checkNumberStatus` |
| Contacts | get/list, profile picture |
| Groups | get/list/create, participants add/remove/promote/demote, leave, description, subject, invite code + revoke |
| Presence | chat typing state only |
| Misc | `getScreenshot()` (the dashboard's screenshot button), `getQR()` |

## Not supported (inherited `NotImplementedByEngineError`)

No labels, no channels/newsletters, no LID mapping, no statuses/stories, no chat overview,
no message edit/star/pin, no `clearMessages`/archive, no block/unblock, no `getPresence`/`getPresences`,
no profile or group picture updates, and no media **download** manager — outgoing media is sent as
base64 through `MessageMedia` rather than the `MediaManager` pipeline.

Search-based reply/react/delete only look at the **last 100 messages** of a chat.

> ⚠️ Dead code in the file: `scheduleReadyReconcile()` is never called; `markReady()` only runs from
> the `ready` event.

## Proxy

Only `--proxy-server=<server>` is passed as a Chromium flag — **`username`/`password` are ignored**
(no proxy auth handling) and SOCKS support depends entirely on Chromium. Compare with NOWEB, which
builds proper `HttpsProxyAgent`/`SocksProxyAgent` pairs ([[Proxy Support]]).

## When to choose it

Use WEBJS when you specifically need Chrome-side behaviour (a feature that only works through the
web client, or screenshotting the WhatsApp Web view). For everything else NOWEB is faster to start,
lighter in RAM, and supports a much larger slice of the API.

## Related

[[Engines Overview]] · [[NOWEB Engine]] · [[Directory Map]] · [[Known Gaps and Stubs]] · [[Dashboard]]

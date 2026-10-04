---
type: note
section: engines
tags: [bunwa, engine, webjs, puppeteer]
updated: 2026-10-04
source: src/core/engines/webjs/session.webjs.core.ts, src/core/session/session.browser.ts
status: partial
---

# 🖥️ WEBJS Engine

**`src/core/engines/webjs/session.webjs.core.ts`** (≈1190 lines) drives a real headless Chrome through
`whatsapp-web.js` → `web.whatsapp.com`. Heavier and narrower than [[NOWEB Engine|NOWEB]], but it is
the fallback for edge cases where the raw Baileys protocol doesn't cover what you need.

Pick it per session with `engine: "WEBJS"` (or `WHATSAPP_DEFAULT_ENGINE=WEBJS`).

## Requirements

- **A Chrome/Chromium binary.** Resolution order: `CHROME_PATH` → `PUPPETEER_EXECUTABLE_PATH` →
  `/usr/bin/google-chrome`, applied by **one shared helper** (`getBrowserExecutablePath()` in
  `session.browser.ts`) for both the manager's pre-flight check and the engine. The manager
  **checks the path exists before starting** and fails fast if it doesn't.
- The Docker images set `PUPPETEER_SKIP_DOWNLOAD=true`, so WEBJS users must mount a Chrome binary
  into the container ([[Docker and Deployment]]).
- `sessionConfig.webjs.authTimeout` controls the pairing-code timeout.

## Lifecycle

```text
start()  →  buildClient()
              new Client({
                authStrategy: new LocalAuth({ clientId: name, dataPath: <cwd>/.sessions/webjs }),
                puppeteer:    { headless, args, executablePath: getBrowserExecutablePath() },
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

## Verified capability (2026-10-04, live session `loopy`)

Checked against a live paired WEBJS session: `scripts/verify-endpoints.ts` read pass
(70 routes checked, 38 works, 2 needs a parameter, 29 not applicable, 0 errors) plus a
direct feature drill on the safe test chat. For comparison, the same verifier against the
NOWEB session gave 50 works, 3 needs a parameter, 13 not applicable, 4 verifier-input
timeouts. The WEBJS work surface is smaller, but nothing answered 5xx.

### Works

| Area | Verified live |
|---|---|
| Messages | text (body, timestamp, `fromMe` read back), location, reply, reaction, `sendSeen`, start/stopTyping, delete a sent message |
| Chats | chats list, chat messages, single message, read messages, `checkNumberStatus` for a number |
| Contacts | get/list, contact profile picture |
| Groups | get/list/count, group info, participants, one real group |
| Misc | screenshot (JSON `{screenshot: "<base64 PNG>"}`), QR flow (not re-run: the session was already paired) |

### Gated: 422 with the engine's own reason, never 500

| Family | What the caller sees |
|---|---|
| labels, channels/newsletters, LID mapping, statuses/stories, chat overview, message edit, pin | `The method is not implemented by 'WEBJS' engine...` from the base `notImplemented()` helper |
| star | same, after the route catch was taught to rethrow engine errors instead of flattening them |
| archive, clear messages, block/unblock | same; the route stubs now delegate to the engine instead of a hardcoded 500 (block/unblock) or a silent 200 (clear messages) |
| presence getters | same; WEBJS no longer pretends with empty lists |
| profile and group picture updates | same |
| media download | `Downloading media through the media manager is not implemented by the WEBJS engine...` |
| `checkNumberStatus` for a username handle | `The WEBJS engine cannot look up a WhatsApp username...` |
| missing chat or group | 404 `Chat <id> not found` / `Group <id> not found` |

### Broken upstream: clean 422, not gated by design

whatsapp-web.js 1.34.7 is incompatible with the current WhatsApp Web build in these
paths. The engine catches the library error and answers 422 with the reason instead of a
500. These need a newer whatsapp-web.js or a different implementation:

- `sendImage` / `sendFile` / `sendVoice` / `sendVideo`: `Sending media is not supported by the installed whatsapp-web.js version...` (WhatsApp Web refuses to key the internal media message model)
- `forwardMessage`: `Forwarding is not supported...` (`WAWebChatForwardMessage` no longer exists)
- group invite code and revoke: `Group invite codes are not supported...` (`WAWebMexFetchGroupInviteCodeJob` no longer exists)

### Compatibility shims in the engine

- `getChatModel`: the last-message lookup throws an IndexedDB DataError on this build; the shim resolves the last message from the loaded collection instead. Without it the chats list, message history and groups answered 500.
- `sendMessage`: the library looks the sent message up with a key spelling this build no longer uses and returns undefined; the shim returns the newly added collection entry.
- Message id normalization: `Message.id._serialized` is filled from the build's `$1` form so delete, forward and reply quoting can address messages.

### Outstanding

- `DELETE /api/:session/groups/:id` is still a hardcoded 500 ("Delete group not available in NOWEB engine"). It is not part of the verified families and was left as is.
- Group create/leave/description/subject and participant add/remove/promote/demote are implemented but were not exercised live, to avoid mutating the only real group.
- Search-based reply/react/delete only look at the last 100 messages of a chat.

> Dead code in the file: `scheduleReadyReconcile()` is never called; `markReady()` only runs from
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

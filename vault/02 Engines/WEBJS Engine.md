---
type: note
section: engines
tags: [bunwa, engine, webjs, puppeteer]
updated: 2026-11-24
source: src/core/engines/webjs/session.webjs.core.ts, src/core/session/session.browser.ts
status: partial
---

# 🖥️ WEBJS Engine

**`src/core/engines/webjs/session.webjs.core.ts`** (≈1 700 lines) drives a real headless Chrome through
`whatsapp-web.js` → `web.whatsapp.com`. Heavier and narrower than [[NOWEB Engine|BUNWEB]], but it is
the engine for WhatsApp **voice calls** and the fallback for edge cases where the raw Baileys
protocol doesn't cover what you need.

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
              ensureWebVersionCache(pin)   → <cwd>/.wwebjs_cache/<version>.html
              new Client({
                authStrategy: new LocalAuth({ clientId: name, dataPath: <cwd>/.sessions/webjs }),
                webVersion, webVersionCache: { type: 'local', path, strict: true },
                proxyAuthentication,        // when proxyConfig has credentials
                puppeteer:    { headless, args, executablePath: getBrowserExecutablePath() },
              })
              client.initialize()
              scheduleReadyReconcile()     // promotes to WORKING if `ready` was missed
stop()   →  clearReadyReconcile() → client.destroy()
unpair() →  client.logout() → stop()
```

> ⚠️ **Pin the WhatsApp Web build.** whatsapp-web.js calls internal `WAWeb*` modules
> (`WAWebSocketModel`, `WAWebAltDeviceLinkingApi`) whose names change between releases. When the
> library loads the live build and WhatsApp has renamed one, `inject()` never resolves
> (`Waiting failed: 30000ms exceeded`) and `requestPairingCode()` throws `CompanionHelloError`.
> The engine pins `2.3000.1055802486` by default and downloads its index.html into
> `.wwebjs_cache/` when missing. Override with `WEBJS_WEB_VERSION`, relocate with
> `WWEBJS_CACHE_DIR`. A failed download logs a warning and falls back to the live build.

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
| `checkNumberStatus` for a username handle | `The WEBJS engine cannot look up a WhatsApp username...` |
| missing chat or group | 404 `Chat <id> not found` / `Group <id> not found` |

### Broken upstream: clean 422, not gated by design

These paths depend on whatsapp-web.js internals that WhatsApp Web has moved across builds. The
engine catches the library error and answers 422 with the reason instead of a 500. Pinning the web
build (see Lifecycle) keeps the module surface stable, but the forward/invite paths below are still
gated by the library's own API shape:

- `sendImage` / `sendFile` / `sendVoice` / `sendVideo`: gated **only when the library answers** `Data passed to getter must include an id property` — with the pinned build the media path is reachable; the 422 remains as a clean failure mode.
- `forwardMessage`: `Forwarding is not supported...` (`WAWebChatForwardMessage` no longer exists)
- group invite code and revoke: `Group invite codes are not supported...` (`WAWebMexFetchGroupInviteCodeJob` no longer exists)

### Compatibility shims in the engine

- `getChatModel`: the last-message lookup throws an IndexedDB DataError on this build; the shim resolves the last message from the loaded collection instead. Without it the chats list, message history and groups answered 500.
- `sendMessage`: the library looks the sent message up with a key spelling this build no longer uses and returns undefined; the shim returns the newly added collection entry.
- Message id normalization: `Message.id._serialized` is filled from the build's `$1` form so delete, forward and reply quoting can address messages.
- `findMessageById`: replies, reactions, edits, deletes, single-message reads and forwards resolve through `client.getMessageById` first and only then scan the last 100 messages of the named chat. Before this, anything older than 100 messages answered "not found".
- Inbound dedupe: webjs emits both `message` and `message_create` for the same inbound message, and the engine listens to both because some LID chats fire only one. A 5-minute id cache keeps downstream consumers at one event, matching BUNWEB's `DistinctMessages()`.
- Message contract: inbound and sent messages now carry `source` (`app`/`api`), `type`, `ack`, `ackName` and `replyTo`, and a send returns the real body instead of an empty string. Ack events carry `ackName`/`fromMe` instead of a private `status` string.
- `getChatMessages`: applies the `timestamp` / `fromMe` / `ack` filter and sorts newest-first like the BUNWEB store, instead of returning the chat's own order and ignoring the filter.
- Inbound media is stored like BUNWEB: `WebJSMediaProcessor` downloads through `message.downloadMedia()` and `attachMedia()` publishes `media` + `mediaUrl`; `downloadMedia: true` now works instead of answering 422.
- Media inputs (`sendImage` / `sendFile` / `sendVoice` / `sendVideo`) resolve through the shared `src/core/media/media-input.ts`: buffer, base64, data URL, http(s) URL and local path are distinguished (a path is read from disk instead of being base64-encoded), and the declared mimetype/filename are carried into `MessageMedia`.
- Pure mapping helpers (`mapWwebjsMessageType`, `toWebjsParticipantId`, `toGroupParticipant`, `splitProxyConfig`, `formatPairingCode`) live in `webjs.mappers.ts`, unit-tested without a browser.
- Proxy: a `ProxyConfig` with `username`/`password` is split into `--proxy-server` plus wwebjs `proxyAuthentication` (Chromium ignores credentials in the flag).

### Outstanding

- `DELETE /api/:session/groups/:id` is still a hardcoded 500 ("Delete group not available in NOWEB engine"). It is not part of the verified families and was left as is.
- Group create/leave/description/subject and participant add/remove/promote/demote are implemented but were not exercised live, to avoid mutating the only real group.
- Forwarding still depends on `WAWebChatForwardMessage`; the direct message lookup fixes *finding* the source, not the library's broken forward path.
- `setPresence` without a chat id is a no-op: whatsapp-web.js 1.34.8 exposes no global presence API. Chat-scoped typing/recording works.
- `getChatsOverview` reports `picture: undefined` (no contact-store projection on WEBJS).

## Proxy

`--proxy-server=<server>` plus `proxyAuthentication` when the session's `ProxyConfig` carries
`username`/`password` (the engine splits credentials out of the URL and calls
`page.authenticate`). SOCKS support depends entirely on Chromium. Compare with BUNWEB, which
builds proper `HttpsProxyAgent`/`SocksProxyAgent` pairs ([[Proxy Support]]).

## When to choose it

Use WEBJS when you specifically need Chrome-side behaviour (a feature that only works through the
web client, or screenshotting the WhatsApp Web view). For everything else NOWEB is faster to start,
lighter in RAM, and supports a much larger slice of the API.

## Related

[[Engines Overview]] · [[NOWEB Engine]] · [[Directory Map]] · [[Known Gaps and Stubs]] · [[Dashboard]]

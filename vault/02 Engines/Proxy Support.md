---
type: note
section: engines
tags: [bunwa, engine, proxy, ops]
updated: 2026-09-14
source: src/core/helpers.proxy.ts, src/core/engines/noweb/session.noweb.core.ts, src/core/engines/webjs/session.webjs.core.ts
status: partial
---

# 🌍 Proxy Support

WhatsApp blocks datacenter IPs aggressively, so per-session proxying is a first-class need. Support
exists — but only on NOWEB, and only per session (the global env-var surface is dead).

## Per-session configuration

`SessionConfig.proxy` in `src/structures/sessions.dto.ts`:

```ts
proxy?: {
  server: string;      // http(s)://host:port | socks4://host:port | socks5://host:port
  username?: string;
  password?: string;
}
```

Set it when creating/updating a session (`POST /api/sessions`, `PATCH /api/sessions/:session/config`)
or from the dashboard's **Session Settings → Proxy** tab ([[Dashboard]]).

## NOWEB — full support

`makeProxyAgents()` (engine) → `createAgentProxy()` (`src/core/helpers.proxy.ts`):

| Scheme | Agent |
|---|---|
| `http://` · `https://` | `HttpsProxyAgent` |
| `socks4://` · `socks5://` | `SocksProxyAgent` |

Credentials are embedded into the proxy URL. Two agents are produced and injected separately:

```text
Agents { socket, fetch }
  socket → Baileys WebSocket transport   (the WhatsApp connection itself)
  fetch  → media uploads / outbound fetches
```

Both are passed into the socket config, so proxying covers control traffic *and* media.

## WEBJS — partial

Only a Chromium flag: `--proxy-server=${proxyConfig.server}`. **`username`/`password` are ignored**
(there is no proxy-auth handling) and SOCKS support depends on what Chromium accepts. If you need
authenticated proxying with WEBJS, use an upstream proxy that authenticates by IP allow-list.

## Global env vars — ⚠️ not wired

`WhatsappConfigService` exposes getters for these, and `.env.example` documents them, but **no code
path consumes them**:

```text
WHATSAPP_PROXY_SERVER
WHATSAPP_PROXY_SERVER_LIST
WHATSAPP_PROXY_SERVER_INDEX_PREFIX
WHATSAPP_PROXY_SERVER_USERNAME
WHATSAPP_PROXY_SERVER_PASSWORD
```

There is no "assign proxy #3 to session X" plumbing in this fork. Configure `proxy` per session
instead, or add the plumbing ([[Roadmap]]).

## Practical notes

- Rotating proxies: if the IP changes mid-session, WhatsApp may invalidate the connection — prefer a
  sticky exit IP per session.
- After changing a session's proxy, restart the session for it to take effect.
- Screenshot/QR flows are unaffected by proxying (they are server-side).

## Related

[[Engines Overview]] · [[NOWEB Engine]] · [[WEBJS Engine]] · [[Configuration Reference]] · [[Known Gaps and Stubs]]

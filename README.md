<div align="center">
  <img src="frontend/public/logo.jpg" alt="BunWa logo" width="96" />

  <h1>BunWa</h1>
  <p><strong>A WhatsApp HTTP API server built on Bun and Hono.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-2026.10.0-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/license-BCL%20v1.0-green?style=flat-square" alt="License" />
    <img src="https://img.shields.io/badge/Bun-1.4.2%2B-14151a?style=flat-square&logo=bun" alt="Bun" />
    <img src="https://img.shields.io/badge/tests-879%20passing-brightgreen?style=flat-square" alt="Tests" />
    <a href="https://hub.docker.com/r/loopyoratory/bunwa">
      <img src="https://img.shields.io/badge/Docker-loopyoratory%2Fbunwa-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Hub" />
    </a>
    <a href="vault/Home.md">
      <img src="https://img.shields.io/badge/docs-vault-6E4AFF?style=flat-square" alt="Vault" />
    </a>
  </p>
</div>

## What is BunWa

BunWa is a WhatsApp HTTP API server. It keeps WAHA's route names and payloads, so existing WAHA
scripts and SDKs keep working, but it runs as a single Bun process on Hono instead of Node.js.

Two engines are available per session. **BUNWEB** (Baileys) is the default: light, browserless, and
the right choice for chat and voice notes. **WEBJS** (whatsapp-web.js + Chrome) exists for WhatsApp
voice calls and the narrower cases where the browser client is needed.

Beyond the API, BunWa includes an MCP server for AI agents, HMAC-signed webhooks with an SSRF guard,
message templates, an anti-ban sending policy, a React dashboard, and an n8n community node. It is a
fork of [OpenWA](https://github.com/rmyndharis/OpenWA), developed independently for Bun.

## Quick start

Requirements: Bun 1.4.2+, and ffmpeg if you send voice notes. Chrome is only needed for WEBJS.

```bash
git clone https://github.com/LoopyOratory/BunWa.git bunwa
cd bunwa
cp .env.example.minimal .env     # or .env.example for every option
# edit .env and set BUNWA_API_KEY
bun run setup                    # installs dependencies and builds the dashboard
bun run start                    # http://localhost:3000
```

For development: `bun run dev` runs the API on port 3001 and Vite with HMR on 5173.

## Link a session

A session is one WhatsApp account. Create it, start it, then link the phone either by QR or by a
pairing code.

```bash
BASE=http://localhost:3000

curl -X POST "$BASE/api/sessions" -H "X-Api-Key: $BUNWA_API_KEY" \
  -H 'Content-Type: application/json' -d '{"name":"my-session"}'

curl -X POST "$BASE/api/sessions/my-session/start" -H "X-Api-Key: $BUNWA_API_KEY"

# QR: base64 PNG, valid while the status is SCAN_QR_CODE
curl "$BASE/api/my-session/auth/qr" -H "X-Api-Key: $BUNWA_API_KEY"

# Or a pairing code: WhatsApp, Linked devices, Link with phone number
curl -X POST "$BASE/api/my-session/auth/request-code" -H "X-Api-Key: $BUNWA_API_KEY" \
  -H 'Content-Type: application/json' -d '{"phoneNumber":"15551234567"}'
```

Pairing codes are rate-limited by WhatsApp. If the API returns 429, wait about ten minutes before
asking again — retrying sooner extends the block.

## Engines

| Engine | Runs on | Use it for |
| --- | --- | --- |
| **BUNWEB** (default) | Baileys, no browser | Chat, media, groups, channels, labels, presence, statuses, voice notes. About 50 MB per session. |
| **WEBJS** | whatsapp-web.js + Chrome | Voice calls. Also supports chat, groups, presence and inbound media storage, but not channels, labels or polls. |

Pick one per session with `engine` in the session config, or change the default through
`WHATSAPP_DEFAULT_ENGINE`. `NOWEB` is still accepted as the old name for BUNWEB.

## What you can do

- **Messaging:** text, image, file, voice, video, location, contact card, link preview, reply,
  forward, reaction, star, seen, typing, stickers, buttons and lists, polls.
- **Chats and groups:** history, archive, mute, unread, pin; group create/leave, participants,
  invite codes, description and security settings.
- **Channels, labels, LIDs, contacts and presence.**
- **Templates and bulk send:** `{{variables}}`, preview, send by id or name, cancellable batches.
- **Anti-ban sending policy:** per-minute/hour/day caps, cold-outreach timelock, new-chat quota,
  quiet hours, optional warm-up, per-session overrides. Blocked sends answer 429 with `Retry-After`.
- **Webhooks:** global or per-session, HMAC-SHA256, idempotency, retries, message filters, SSRF guard.
- **MCP and n8n:** agent tools over HTTP or stdio, and an n8n node package.

## Send a message

```bash
curl -X POST "$BASE/api/sendText" -H "X-Api-Key: $BUNWA_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"session":"my-session","chatId":"15551234567@c.us","text":"Hello from BunWa"}'
```

The same shape works for `sendImage`, `sendFile`, `sendVoice`, `sendVideo`, `sendLocation` and
`sendPoll`. The interactive reference is at `http://localhost:3000/api-docs/`.

## Access and security

Three credentials can reach the API:

- **`BUNWA_API_KEY`** — full admin, sent as `X-Api-Key`.
- **Dashboard login** (`BUNWA_DASHBOARD_USERNAME` / `BUNWA_DASHBOARD_PASSWORD`) — full admin, used
  by the dashboard UI.
- **Per-session keys** (`sk_ses_...`) — one session, only the actions in their allowlist.

Keyless access is **off by default**. If no API key is configured, the API and MCP endpoint reject
requests unless you explicitly set `BUNWA_ALLOW_NO_AUTH=true` — useful on a laptop, never in
production. Set a strong `BUNWA_API_KEY` before exposing the server.

## Media storage

Inbound media is downloaded and stored, then linked from the message as `media` and `mediaUrl`.

- **Local (default):** `<WHATSAPP_FILES_FOLDER>/<session>/<messageId>.<ext>`, served at
  `/api/files/...` behind the same API key. URLs expire after 180 seconds by default; change that
  with `BUNWA_MEDIA_LIFETIME_SECONDS`. One background sweeper deletes expired files.
- **S3:** set `BUNWA_STORAGE_TYPE=s3` and the `BUNWA_S3_*` variables. Links are presigned GET URLs
  valid for one hour.
- Outgoing media is not stored. Media rules are identical on both engines.

## MCP

`POST /mcp` speaks the Model Context Protocol over HTTP; `bun run src/mcp/stdio.ts` provides a stdio
transport scoped to one session. Use a per-session MCP key (`sk_mcp_...`) rather than the master key.

```json
{
  "mcpServers": {
    "bunwa": {
      "url": "http://localhost:3000/mcp",
      "headers": { "x-api-key": "your-mcp-key" }
    }
  }
}
```

`MCP_ENABLED=false` unmounts the endpoint, `MCP_READONLY=true` exposes only read tools, and
`MCP_RATE_LIMIT_MAX` caps requests per key. The full tool list is in
[`vault/05 MCP/MCP Tools Reference.md`](vault/05%20MCP/MCP%20Tools%20Reference.md).

## Configuration

Everything is environment variables; [`.env.example`](.env.example) is the complete reference. The
ones that matter first:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `BUNWA_API_KEY` | unset | Set this in production. |
| `BUNWA_ALLOW_NO_AUTH` | unset (closed) | `true` allows keyless access for development. |
| `BUNWA_DASHBOARD_USERNAME` / `BUNWA_DASHBOARD_PASSWORD` | unset | Dashboard login. |
| `WHATSAPP_DEFAULT_ENGINE` | `BUNWEB` | `BUNWEB` or `WEBJS`. |
| `BUNWA_DATABASE_DRIVER` | `sqlite` | `sqlite`, `postgres` or `postgresql`. |
| `BUNWA_STORAGE_TYPE` | `local` | `local` or `s3` for media. |
| `BUNWA_LOG_LEVEL` | `info` | `trace` … `fatal`. |
| `SEND_POLICY_ENABLED` | `true` | Master switch for the anti-ban policy. |
| `MCP_ENABLED` | `true` | `false` unmounts `POST /mcp`. |

Legacy `WAHA_*` variable names still work; the `BUNWA_*` spelling is preferred.

## Docker

Four Compose files ship at the repo root:

- `docker-compose.yml` — single node, SQLite, behind your own proxy.
- `docker-compose.postgres.yml` — BunWa plus PostgreSQL 17.
- `docker-compose.coolify.yml` — for Coolify's Compose build pack.
- `docker-compose.1panel.yml` — pulls the published image, for 1Panel.

All run as UID/GID 1001, read `.env` next to the Compose file, and refuse to start without
`BUNWA_API_KEY`. State lives in the `bunwa-sessions` and `bunwa-data` volumes (`bunwa-media` for
Coolify). If you use host paths instead, `chown -R 1001:1001` them first.

```bash
docker compose -f docker-compose.yml up -d
```

## Development

```bash
bun run test        # bun test --parallel src/
bun run typecheck   # tsc --noEmit
bun run lint        # oxlint src/
bun run build:frontend
```

`bun run test:postgres` runs the store against a real Postgres or PGlite, and
`scripts/verify-endpoints.ts` exercises a running server (read-only unless explicitly told
otherwise).

## Documentation

- [`vault/Home.md`](vault/Home.md) — architecture, engines, API, MCP, security, known gaps, ops.
- [`vault/06 Security/Known Gaps and Stubs.md`](vault/06%20Security/Known%20Gaps%20and%20Stubs.md) —
  what is intentionally unsupported today.
- [`integrations/n8n-nodes-bunwa/README.md`](integrations/n8n-nodes-bunwa/README.md) — n8n node.
- [`.env.example`](.env.example) — every variable and its default.
- `http://localhost:3000/api-docs/` — interactive API reference while the server runs.

## License

BunWa is released under the **BunWa Community License (BCL) v1.0**. It is free for personal,
open-source, educational and non-commercial use. Commercial use requires a license at **US $200 per
month per organisation**, covering unlimited internal deployments. Full terms:
[LICENSE.md](LICENSE.md).

<div align="center">
  <sub>Built with ❤️ using <a href="https://bun.sh">Bun</a> + <a href="https://hono.dev">Hono</a></sub>
</div>

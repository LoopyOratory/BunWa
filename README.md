<div align="center">
  <img src="frontend/public/logo.jpg" alt="BunWa logo" width="96" />

  <h1>BunWa</h1>
  <p><strong>A WAHA-compatible WhatsApp HTTP API server built on Bun and Hono.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/version-2026.5.1-blue?style=flat-square" alt="Version" />
    <img src="https://img.shields.io/badge/license-BCL%20v1.0-green?style=flat-square" alt="License" />
    <img src="https://img.shields.io/badge/Bun-1.4.2%2B-14151a?style=flat-square&logo=bun" alt="Bun" />
    <img src="https://img.shields.io/badge/tests-222%20passing-brightgreen?style=flat-square" alt="Tests" />
    <a href="https://hub.docker.com/r/loopyoratory/bunwa">
      <img src="https://img.shields.io/badge/Docker-loopyoratory%2Fbunwa-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker Hub" />
    </a>
    <a href="vault/Home.md">
      <img src="https://img.shields.io/badge/docs-vault-6E4AFF?style=flat-square" alt="Vault" />
    </a>
  </p>
</div>

## What is BunWa

BunWa is a WhatsApp HTTP API server that keeps WAHA's route names and payloads, so existing WAHA
scripts and SDKs work unchanged, but runs as a single Bun process on the Hono framework instead of
Node.js. The default NOWEB engine uses Baileys and needs no browser; an optional WEBJS engine uses
whatsapp-web.js with Chrome when you need it. Beyond the compatible surface, BunWa ships an MCP
server for AI agents, a structured audit log, editable and sendable message templates, HMAC-signed
webhooks with an SSRF guard, a per-session anti-ban sending policy, a React dashboard, and an n8n
community node. It is a fork of [OpenWA](https://github.com/rmyndharis/OpenWA) and is developed
independently for Bun. The project is at version 2026.10.0; its recorded gate at commit 8661ed5 is
449 tests passing with 1 skipped, across 44 test files.

## Features

| Group | What it covers |
| --- | --- |
| Sessions and engines | NOWEB (Baileys, default) and WEBJS (whatsapp-web.js + Chrome) selectable per session. QR scan or phone pairing, start, stop, restart, logout, force kill, delete, auto-start on boot, per-session proxy and session config. |
| Messaging | Text, image, file, voice, video, location, poll, contact vCard, link preview, reply, forward, reaction, star, seen, typing and sticker. Buttons and lists through native flows (WhatsApp caps 3 buttons, and 10 list rows across 3 sections). Bulk batches with progress and cancel. Status and stories. Voice-note transcoding to OGG/Opus with ffmpeg. |
| Chats and groups | Chat list, messages, archive, delete, mark read or unread, pin and unpin, reactions. Groups: create, leave, participants add, remove, promote and demote, invite codes, description, subject, join info, security settings. Channels, labels, LIDs, contacts and presence. |
| Webhooks and events | Global and per-session subscriptions, HMAC-SHA256 signatures, idempotency keys, delivery ids, bounded retries with backoff, message filters, SSRF protection and a real test delivery endpoint. Webhook subscriptions and the `/ws` event monitor use the `WAHAEvents` list, which defines 30 event types. |
| MCP | 77 tools over HTTP (`POST /mcp`) and stdio. Per-session keys scoped to one session, per-session allow and deny policies, a destructive-operations gate, rate limiting and a read-only mode. |
| Templates and bulk send | Per-session templates with `{{variables}}` (including dotted paths), create, edit, delete, preview and send, addressed by id or name. Bulk sends return a batch id with sent, failed and remaining counts, and can be cancelled. |
| Anti-ban sending policy | Per-session caps per minute, hour and day, a cold-outreach timelock between new chats, a new-chat daily quota, quiet hours, a warm-up ramp for new sessions, per-session overrides and a bypass list. Blocked sends answer 429 with a `Retry-After` header. |
| Security | API key and dashboard Basic auth, per-session MCP keys stored as SHA-256 hashes, auth-exempt path list, audit log with retention, 10 MB request body cap, 200 requests per minute per IP on `/api/*`, and SSRF-hardened webhook delivery. |
| Dashboard | React 19, Vite and Tailwind dashboard served by the same process: sessions and QR pairing, live chat, templates, message tester, audit logs, WebSocket event monitor, infrastructure settings, MCP key management, worker list and API docs. |
| Integrations | n8n community node with 131 operations across 10 resources plus a webhook trigger, Chatwoot webhook app, and S3-compatible media storage. |

## Quick start (local)

Requirements: Bun 1.4.2 or newer (`engines.bun`, pinned in `.bun-version`). ffmpeg is needed for
voice-note transcoding (`sendVoice` with `convert=true`). Chrome or Chromium is only needed for the
WEBJS engine; point `CHROME_PATH` or `PUPPETEER_EXECUTABLE_PATH` at it.

```bash
# Clone and install
git clone https://github.com/LoopyOratory/BunWa.git bunwa
cd bunwa
bun install

# Configure
cp .env.example.minimal .env   # minimal production set, three required values
#   or cp .env.example .env     # full reference with every option
# Edit .env and set WAHA_API_KEY. In production also set WAHA_ALLOW_NO_AUTH=false.

# Build the dashboard and start
bun run setup            # installs dependencies and builds frontend-dist/
bun run start            # production server on http://localhost:3000 (same as bash scripts/start.sh)

# Or run in development
bun run dev              # API on http://localhost:3001, Vite dev server with HMR on http://localhost:5173
```

The dashboard is served at `http://localhost:3000` and the default login is `admin` / `admin`
(change it with `WAHA_DASHBOARD_USERNAME` and `WAHA_DASHBOARD_PASSWORD`).

> Set `WAHA_API_KEY` to a strong random value and `WAHA_ALLOW_NO_AUTH=false`. With no API key and
> the default `WAHA_ALLOW_NO_AUTH=true`, the API, dashboard, WebSocket and MCP endpoint all accept
> unauthenticated requests.

## Deploy

Four Compose files live at the repo root. The general, Postgres and Coolify files build the local
image tagged with the version in `package.json`; the 1Panel file pulls the published multi-arch image
from Docker Hub. All of them run the container as UID/GID 1001 with a read-only root filesystem, read
the `.env` file next to the compose file, and refuse to start unless `WAHA_API_KEY` is set.

| File | Audience | Database | Required env | Command |
| --- | --- | --- | --- | --- |
| [`docker-compose.yml`](docker-compose.yml) | General single-node deployment behind your own reverse proxy. | SQLite (the built-in default, no database variables set). | `WAHA_API_KEY` | `docker compose -f docker-compose.yml up -d` |
| [`docker-compose.postgres.yml`](docker-compose.postgres.yml) | Self-contained BunWa plus PostgreSQL 17. | Postgres for the session store and templates; audit and the anti-ban ledger stay in local SQLite. | `WAHA_API_KEY`, `POSTGRES_PASSWORD` | `docker compose -f docker-compose.postgres.yml up -d` |
| [`docker-compose.coolify.yml`](docker-compose.coolify.yml) | Coolify's Docker Compose build pack. No published ports; Coolify's proxy routes to port 3000. | SQLite. | `WAHA_API_KEY` | `docker compose -f docker-compose.coolify.yml up -d` |
| [`docker-compose.1panel.yml`](docker-compose.1panel.yml) | 1Panel's Compose feature. Pulls the published `loopyoratory/bunwa` image instead of building; publishes on `127.0.0.1:${BUNWA_PORT:-3000}` for 1Panel's reverse proxy. | SQLite. | `WAHA_API_KEY`; `BUNWA_TAG` selects the image tag (default `sha-ffd06de`) | `docker compose -f docker-compose.1panel.yml up -d` |

The SQLite and Postgres files publish the API on `127.0.0.1` only; terminate TLS in the reverse
proxy you put in front. The Coolify and 1Panel files expect their platform proxy to handle routing
and HTTPS.

Persistent state lives in the `bunwa-sessions` and `bunwa-data` named volumes (plus `bunwa-media`
in the Coolify file). If you replace them with host paths, the host directories must be writable by
UID/GID 1001, the `waha` user inside the image:

```bash
mkdir -p /data/bunwa/sessions /data/bunwa/data /data/bunwa/media
chown -R 1001:1001 /data/bunwa
```

The 1Panel file uses the same named volumes, so it needs no host preparation. If you want host paths
instead, for example so 1Panel's file manager and path based backups can see the data, the file
includes a commented out bind mount alternative with the required `chown -R 1001:1001` step and a
note that SELinux hosts also need a `:z` suffix on each mount.

For `docker-compose.postgres.yml`, a host path for Postgres data must be writable by uid 70 (the
`postgres` user in `postgres:17-alpine`): `mkdir -p /data/bunwa/postgres && chown -R 70:70 /data/bunwa/postgres`.

To run the published multi-arch image (`linux/amd64`, `linux/arm64`) directly:

```bash
docker run -d --name bunwa \
  -p 3000:3000 \
  -e WAHA_API_KEY=change-me \
  -e WAHA_ALLOW_NO_AUTH=false \
  -v bunwa-sessions:/app/.sessions \
  -v bunwa-data:/app/data \
  -v bunwa-media:/app/.media \
  --restart unless-stopped \
  loopyoratory/bunwa:latest
```

Tags: `latest` and `main` move with the main branch, `sha-<short>` pins any build, and release tags
(`2026.5.1`, `2026.5`) are published from `v*` git tags when one is pushed. No release tag has been
published yet, so pin `sha-<short>` for now. See `.github/workflows/docker.yml` for the publishing
details.

## Core API tour

All `/api` routes accept `X-Api-Key`. `/health` and `/ping` are public. The examples below assume
`WAHA_API_KEY` is exported in your shell.

```bash
# Create a session
curl -X POST http://localhost:3000/api/sessions \
  -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"my-session"}'

# Start it
curl -X POST http://localhost:3000/api/sessions/my-session/start \
  -H "X-Api-Key: $WAHA_API_KEY"

# Read the QR code (base64 PNG) once the status is SCAN_QR_CODE.
# Add ?phoneNumber=15551234567 for a pairing code instead.
curl "http://localhost:3000/api/my-session/auth/qr" -H "X-Api-Key: $WAHA_API_KEY"

# Send a text message
curl -X POST http://localhost:3000/api/sendText \
  -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" \
  -d '{"session":"my-session","chatId":"15551234567@c.us","text":"Hello from BunWa"}'

# Send a message with reply buttons
curl -X POST http://localhost:3000/api/sendButtons \
  -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "session": "my-session",
    "chatId": "15551234567@c.us",
    "body": "How can we help?",
    "buttons": [
      {"type": "reply", "text": "Sales", "id": "sales"},
      {"type": "reply", "text": "Support", "id": "support"}
    ]
  }'

# List the session's templates
curl http://localhost:3000/api/sessions/my-session/templates \
  -H "X-Api-Key: $WAHA_API_KEY"

# Render and send a template by name or id
curl -X POST http://localhost:3000/api/sessions/my-session/templates/welcome-message/send \
  -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" \
  -d '{"chatId":"15551234567@c.us","variables":{"name":"Ada"}}'

# Read sending-policy usage counters and next-allowed times
curl http://localhost:3000/api/sessions/my-session/policy/usage \
  -H "X-Api-Key: $WAHA_API_KEY"
```

Buttons make a round trip. The engine wraps the interactive message in a view-once envelope, and
the tap comes back as a `templateButtonReplyMessage` that BunWa parses into the `interactive`
object with `selectedId`:

```mermaid
sequenceDiagram
    API->>Engine: POST /api/sendButtons
    Engine->>Engine: wrap in viewOnceMessageV2Extension
    Engine->>WhatsApp: relayMessage with biz nodes
    WhatsApp->>Customer: renders the reply buttons
    Customer->>WhatsApp: taps a button
    WhatsApp->>Engine: templateButtonReplyMessage
    Engine->>Engine: extractInteractiveReply reads selectedId
    Engine->>Webhook: message event with interactive.selectedId
```

The interactive API reference is at `http://localhost:3000/api-docs/`. It is generated from the
OpenAPI document in `src/swagger.ts`.

## WhatsApp usernames

WhatsApp's username rollout lets a person be contacted by a handle instead of a phone number. BunWa
recognizes the three spellings in use (`handle`, `@handle`, `handle@username`), validates them against
Meta's published rules (3 to 35 characters from `a-z`, `0-9`, `.` and `_`, at least one letter, no
leading, trailing or doubled periods, no `www` prefix, no domain-like ending, case-insensitive) and,
on the default NOWEB engine, resolves a valid handle through the protocol's USync username query
before sending. A username is an alias for the user's LID, not a new address type, so a handle works
only when WhatsApp itself can resolve it for your account.

Routes that accept a username wherever they accept `chatId` (NOWEB engine):

| Route | Notes |
| --- | --- |
| `POST /api/sendText`, `/sendImage`, `/sendFile`, `/sendVoice`, `/sendVideo`, `/sendLocation`, `/sendPoll`, `/sendContactVcard`, `/sendLinkPreview`, `/send/link-custom-preview`, `/sendButtons`, `/sendList`, `/sendSticker` | body `chatId` may be a handle |
| `POST /api/reply`, `/forwardMessage`, `/sendSeen`, `/startTyping`, `/stopTyping` | body `chatId` may be a handle |
| `PUT /api/star` | body `chatId` may be a handle |
| `POST /api/sessions/:session/templates/:id/send` | body `chatId` may be a handle |
| `GET /api/checkNumberStatus?session=...&phone=...` and `GET /api/contacts/check-exists?session=...&phone=...` | `phone` may be a handle; the reply carries an explicit `status` (see below) |

The MCP tools listed in the tables above take the same values through the same engine methods,
including `ContactCheckNumber` and `SessionCheckNumber`.

```bash
# Send to a username instead of a phone number
curl -X POST http://localhost:3000/api/sendText \
  -H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json" \
  -d '{"session":"my-session","chatId":"@ada.lovelace","text":"Hello from BunWa"}'

# Check a username
curl "http://localhost:3000/api/checkNumberStatus?session=my-session&phone=@ada.lovelace" \
  -H "X-Api-Key: $WAHA_API_KEY"
```

When a send target is a malformed handle, or a valid handle WhatsApp does not resolve, the send
answers `422` with a message that names the problem and points at the numeric JID alternative. A
handle is never turned into a broken JID such as `handle@c.us`.

The two check routes answer with an explicit `status`, because a lookup has three possible outcomes
and two of them are not "the user is absent". This distinction was verified against a live paired
session on the NOWEB engine:

| `status` | `exists` | Meaning |
| --- | --- | --- |
| `resolved` | `true` | WhatsApp returned an identity for the handle. A username resolves to the user's LID (`number` and `lid` are the `<lid>@lid` address) and to nothing else: the phone number is not revealed, and `usernameState` (`active`) and any locally known `pushName` are included. The raw USync answer names the LID, a `username` node with `state="active"`, and `contact type="in"`. |
| `not_resolvable` | `false` | WhatsApp answered that the handle is not registered. The raw USync answer carries no jid and a `contact type="out"` node. This is a negative answer from the protocol. |
| `could_not_check` | `null` | No usable answer: the engine cannot look it up, the query failed, or WhatsApp returned an empty answer. This is not proof of absence and must not be presented as one. For a username the reply also carries a `reason`. |

The same three-way rule applies to phone checks: an unknown number is `not_resolvable`, while a
failed or empty `onWhatsApp` answer is `could_not_check`. An MCP tool or UI that shows absence must
read `status` (or treat `exists: null` as unknown), not just the `exists` flag.

Inbound messages carry the sender's handle in `WAMessage.username` when WhatsApp supplies one
(`remoteJidUsername` on a 1:1 message, `participantUsername` on a group participant). The chat
console shows it in the chat header and on the message sender line.

Not supported yet:

- the WEBJS engine has no username lookup, so a username target answers `422` there (a
  `could_not_check` outcome at the route level, not a claim of absence)
- handles are not accepted by chat lookup routes (history, labels, presence, archive) or by any
  search route
- resolution depends on the account's rollout and on WhatsApp returning an answer for the handle;
  the NOWEB lookup and its negative answer shape are verified against a live paired account, but a
  resolved handle has not been exercised end to end with an actual send in that verification
- a resolved username yields a LID and no phone number, so callers that need a phone (for example
  contact cards) cannot get one from this lookup

## Access

Three credential types can reach the REST API. They differ in blast radius:

| Credential | Header | Scope |
| --- | --- | --- |
| Master API key (`WAHA_API_KEY`) | `x-api-key` | Full admin: every session and action, key management, infra, server stop. |
| Dashboard Basic credentials (`WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD`) | `Authorization: Basic ...` | Full admin, identical to the master key. Intended for the dashboard UI. |
| Per-session REST API key (`sk_ses_...`) | `x-api-key` | One session only, and only the actions in its allowlist. Cannot list sessions, read the audit log, touch infra, stop the server, or manage keys for any session including its own. |

Per-session REST keys are created from **Dashboard, Session settings, Access, REST API keys** or with
`POST /api/sessions/:session/api-keys`. The request body may carry a `name` and an `actions` array
drawn from the `Action` enum (`read`, `send`, `list`, `retrieve`, `create`, `setting`, `delete`,
`control`, `app`, `manage`); actions default to `read` and `send`. Grant `manage` and `control` only
when an integration truly needs them. The plaintext is returned once at creation (and again after a
rotate), only its SHA-256 hash is stored, and revocation takes effect immediately: a revoked key is
rejected exactly like an unknown key.

Authentication resolves in this order: master API key, dashboard Basic credentials, then a
per-session REST key. The first two remain full admin. A per-session key can only act on its own
session, and a cross-session request gets the same response whether or not the other session exists.
MCP keys (`sk_mcp_...`) are a separate credential for `POST /mcp`: the REST API does not accept them,
and the MCP endpoint does not accept REST keys.

## MCP

BunWa exposes a Model Context Protocol server with 77 tools for sessions, messaging, chats,
groups, channels, contacts, presence, statuses, templates and the sending policy. Two transports are supported:

- HTTP: `POST /mcp`, authenticated with `x-api-key: <key>` or `Authorization: Bearer <key>`.
- stdio: `bun run src/mcp/stdio.ts`, authenticated with the `BUNWA_SESSION` and `BUNWA_MCP_KEY`
  environment variables.

The HTTP config for an MCP host:

```json
{
  "mcpServers": {
    "bunwa": {
      "url": "http://localhost:3000/mcp",
      "headers": { "x-api-key": "your-api-key" }
    }
  }
}
```

The stdio config, which is scoped to one session:

```json
{
  "mcpServers": {
    "bunwa-default": {
      "command": "bun",
      "args": ["run", "src/mcp/stdio.ts"],
      "env": {
        "BUNWA_SESSION": "default",
        "BUNWA_MCP_KEY": "sk_mcp_..."
      }
    }
  }
}
```

Per-session keys are the intended way to connect agents. Generate one from **Dashboard, Session
settings, MCP** or with `POST /api/sessions/:session/mcp/generate-key`; only the SHA-256 hash is
stored, and the plaintext is shown once. A session key is forced to its own session on scoped tools
and is denied on the one unscoped tool, `SessionList`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MCP_ENABLED` | `true` | Set to `false` to unmount `POST /mcp` (404). |
| `MCP_READONLY` | `false` | Set to `true` to expose only read-tier tools. |
| `MCP_RATE_LIMIT_MAX` | `60` | Maximum MCP requests per key per window. |
| `MCP_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds. |

The full tool list, per-tool tiers and policy behaviour are in
[`vault/05 MCP/MCP Tools Reference.md`](vault/05%20MCP/MCP%20Tools%20Reference.md).

## n8n

[`integrations/n8n-nodes-bunwa`](integrations/n8n-nodes-bunwa/README.md) is a community node
package that wraps this API: 131 operations across 10 resources (message, session, chat, group,
contact, channel, label, presence, status, server), plus a **BunWa Trigger** node. The trigger
registers its own webhook subscription on a session when the workflow is activated and removes it
on deactivation. For button and list replies it flattens the tapped id and label into an
`interactive` object (`type`, `selectedId`, `selectedText`, `repliedToMessageId`), so a workflow can
route on `interactive.selectedId` without knowing the raw payload shape. Installation, operation
tables, workflow examples and deliberately unsupported endpoints are documented in that package's
README. Build it locally and point `N8N_CUSTOM_EXTENSIONS` at the package folder, or install it from
npm once a release is published.

## Compatibility with WAHA

BunWa keeps WAHA's API surface: the same route names, the same session-in-body and session-in-path
dialects, and the same webhook event names.

| Area | Status |
| --- | --- |
| REST API | Route names, request bodies and response shapes follow WAHA, so existing clients and SDKs work unchanged. |
| Sessions, messaging, chats, groups, channels, labels, presence, statuses | Present. |
| MCP server | Fork-only. WAHA has no MCP surface. |
| Redis / BullMQ queue | Not ported. Webhooks are delivered inline with bounded retries; `WAHA_QUEUE_*` variables are reported by the infrastructure endpoint only and have no runtime effect. |
| Plugin marketplace and installer | Not ported. A plugin loader and hook manager exist in the tree but are not wired to any route. |
| Prometheus metrics | Not present. Observability is `/health`, `/ping`, logs and the audit log. |
| Docker module (container management) | Not ported. Use Coolify, 1Panel or your own orchestrator. |
| WebSocket | `/ws` streams session events. `WAHAEvents` defines 30 event types. |

<details>
<summary><strong>Routes that are known to be broken or stubbed</strong></summary>

These are mounted but cannot succeed today. They are listed so you do not build on them. The full,
continuously updated list with causes is in
[`vault/06 Security/Known Gaps and Stubs.md`](vault/06%20Security/Known%20Gaps%20and%20Stubs.md).

| Route | Behaviour |
| --- | --- |
| `POST /api/send/buttons/reply` | Returns `{result: true}` and sends nothing. The engine method exists but has no caller. |
| `POST /api/contacts/block`, `POST /api/contacts/unblock` | 500 on the NOWEB engine; the handlers are stubs. |
| `DELETE /api/:session/groups/:id` | 500; the handler is a stub even though the engine has a delete method. |
| `POST /api/:session/chats/:chatId/mute`, `/unmute` | 400; no engine implements `muteChat`. Channel mute works. |
| `GET /api/contacts/about` | Returns an empty string. |
| `POST /api/:session/events` | Returns a synthetic `{id, timestamp}`. |
| `POST /api/:session/media/convert/video` | Returns a placeholder string. |
| `GET /api/:session/channels/:id/messages/preview` | Returns `AvailableInPlusVersion`; the Argo decoder is missing. |

Parsed message payloads never populate the `location` and `vCards` summary fields, because both
waproto extractors return null. Sending a location or a contact card works, and the recipient
receives it; only the summary fields on the returned message object are empty.

</details>

## Configuration

All configuration is environment variables. [`.env.example`](.env.example) is the single source of
truth: it mirrors every variable listed below with its default. Copy it to `.env` and edit. All
variables are optional and fall back to the defaults shown; booleans accept
`true/false/1/0/yes/no`.

These are the essentials:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. Takes precedence over `WHATSAPP_API_PORT`. |
| `WAHA_API_KEY` | unset | API key for `X-Api-Key` (and the MCP endpoint). Set it in production. |
| `WAHA_ALLOW_NO_AUTH` | `true` | Set to `false` to reject requests without a key. |
| `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD` | `admin` / `admin` | Dashboard login. |
| `WHATSAPP_DEFAULT_ENGINE` | `NOWEB` | `NOWEB` (Baileys) or `WEBJS` (whatsapp-web.js + Chrome). |
| `WAHA_DATABASE_DRIVER` | `sqlite` | `sqlite`, `postgres` or `postgresql`. An unrecognised value, including `mongo`, fails the boot. |
| `WAHA_STORAGE_TYPE` | `local` | Media storage backend: `local` or `s3`. |
| `WAHA_LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error` or `fatal`. |
| `SEND_POLICY_ENABLED` | `true` | Master switch for the anti-ban sending policy. |
| `MCP_ENABLED` | `true` | Set to `false` to unmount the MCP endpoint. |

<details>
<summary><strong>Server and CORS</strong></summary>

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. Takes precedence over `WHATSAPP_API_PORT`. |
| `WHATSAPP_API_PORT` | `3000` | Fallback port if `PORT` is unset. |
| `WHATSAPP_API_SCHEMA` | `http` | URL scheme (`http` or `https`). |
| `WHATSAPP_API_HOSTNAME` | `localhost` | Server hostname. |
| `WAHA_BASE_URL` | unset | Override the auto-generated `schema://hostname:port` base URL. |
| `TRUSTED_PROXIES` | unset | Comma-separated trusted proxy IPs. When set, the rate limiter reads `x-forwarded-for` for the client IP. |
| `WAHA_CORS_ORIGIN` | unset | Comma-separated CORS origins. When set, credentialed CORS is enabled for those origins; empty means wildcard without credentials. |

</details>

<details>
<summary><strong>Authentication, dashboard and API docs</strong></summary>

| Variable | Default | Description |
| --- | --- | --- |
| `WAHA_API_KEY` | unset | API key for programmatic access (header `X-Api-Key`). Strongly recommended. |
| `WAHA_ALLOW_NO_AUTH` | `true` | When `false`, requests without an API key are rejected. Set to `false` in production. |
| `WHATSAPP_API_KEY_EXCLUDE_PATH` | unset | Comma-separated API paths excluded from API-key auth, for example `/api/health,/api/version`. |
| `WAHA_DASHBOARD_ENABLED` | `true` | Enable or disable the dashboard UI. |
| `WAHA_DASHBOARD_USERNAME` | `admin` | Dashboard Basic Auth username. |
| `WAHA_DASHBOARD_PASSWORD` | `admin` | Dashboard Basic Auth password. |
| `WHATSAPP_SWAGGER_ENABLED` | `true` | Enable the interactive API docs at `/api-docs`. |
| `WHATSAPP_SWAGGER_USERNAME` | `admin` | API docs Basic Auth username. |
| `WHATSAPP_SWAGGER_PASSWORD` | empty | API docs Basic Auth password. Empty means no auth. |
| `WHATSAPP_SWAGGER_TITLE` | `BUNWA - WhatsApp HTTP API` | API docs page title. |
| `WHATSAPP_SWAGGER_DESCRIPTION` | empty | API docs description. |
| `WHATSAPP_SWAGGER_EXTERNAL_DOC_URL` | `https://bunwa.ekosystems.dev/` | External docs URL shown in the API docs. |
| `WHATSAPP_SWAGGER_CONFIG_ADVANCED` | `false` | Enable advanced Swagger config options. |

The dashboard login endpoint is rate-limited to 10 attempts per minute. Dashboard Basic credentials
are also accepted on API routes.

</details>

<details>
<summary><strong>Logging</strong></summary>

| Variable | Default | Description |
| --- | --- | --- |
| `WAHA_LOG_LEVEL` | `info` | `trace`, `debug`, `info`, `warn`, `error` or `fatal`. |
| `WAHA_HTTP_LOG_LEVEL` | `info` | HTTP request log level. |
| `WAHA_LOG_FORMAT` | `PRETTY` | `PRETTY` or `JSON`. |
| `DEBUG` | unset | Set to `1` for verbose Baileys debug output. |
| `WAHA_DEBUG_MODE` | `false` | Enable extra diagnostics. |

</details>

<details>
<summary><strong>Engines, sessions and presence</strong></summary>

| Variable | Default | Description |
| --- | --- | --- |
| `WHATSAPP_DEFAULT_ENGINE` | `NOWEB` | `NOWEB` (Baileys) or `WEBJS` (whatsapp-web.js + Chrome). |
| `ENGINE_TYPE` | unset | Alternative engine-type override. |
| `WAHA_NAMESPACE` / `WAHA_SESSION_NAMESPACE` | engine name | Namespace prefix for session names. |
| `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH` | unset | Path to the Chrome or Chromium binary. Required for the WEBJS engine. |
| `WAHA_PRINT_QR` | `true` | Set to `false` to suppress QR output in the console. |
| `WAHA_CLIENT_DEVICE_NAME` | unset | Device name shown to WhatsApp (NOWEB). |
| `WAHA_CLIENT_BROWSER_NAME` | unset | Browser name shown to WhatsApp (NOWEB). |
| `WHATSAPP_START_SESSION` | unset | Comma-separated session names to auto-start on boot. |
| `WHATSAPP_RESTART_ALL_SESSIONS` | `false` | Restore and start all previously running sessions on boot. |
| `WAHA_AUTO_START_DELAY_SECONDS` | `0` | Delay before auto-starting sessions. |
| `WAHA_WORKER_ID` | unset | Worker id for multi-worker deployments. |
| `WAHA_WORKER_RESTART_SESSIONS` | `true` | Worker restores sessions on start. |
| `WAHA_VERSION` | auto | `CORE` or `PLUS`. Defaults to `PLUS` unless explicitly set to `CORE`. Plus adds profile-picture writes, button header media and S3 media storage. |
| `WAHA_PRESENCE_AUTO_ONLINE` | `true` | Mark the session ONLINE on any message activity. |
| `WAHA_PRESENCE_AUTO_ONLINE_DURATION_SECONDS` | `25` | Seconds to keep the session ONLINE after activity. |
| `WAHA_SESSION_CONFIG_IGNORE_STATUS` | `false` | Ignore status and list messages. |
| `WAHA_SESSION_CONFIG_IGNORE_GROUPS` | `false` | Ignore group chats. |
| `WAHA_SESSION_CONFIG_IGNORE_CHANNELS` | `false` | Ignore channels. |
| `WAHA_SESSION_CONFIG_IGNORE_BROADCAST` | `false` | Ignore broadcast lists. |

The WEBJS engine requires Chrome or Chromium on the host and fails with a clear error when it is
missing. The Docker image does not bundle a browser.

</details>

<details>
<summary><strong>Sending policy (anti-ban)</strong></summary>

The policy gates every outbound message (REST, bulk and MCP) per session. Blocked sends answer 429
with a `Retry-After` header, and counters persist in `${WAHA_STORAGE_DIR}/sending-limits.db`. The
REST surface is `GET /api/sessions/:session/policy` for the effective configuration and usage,
`PUT /api/sessions/:session/policy` for per-session overrides, and
`GET /api/sessions/:session/policy/usage` for counters and next-allowed times.

| Variable | Default | Description |
| --- | --- | --- |
| `SEND_POLICY_ENABLED` | `true` | Master switch. Set to `false` to disable all checks. |
| `SEND_POLICY_BYPASS_SESSIONS` | unset | Comma-separated session names that are never gated. |
| `SEND_MAX_PER_MINUTE` | `20` | Maximum messages sent per sliding minute, per session. |
| `SEND_MAX_PER_HOUR` | `200` | Maximum messages sent per sliding hour, per session. |
| `SEND_MAX_PER_DAY` | `1000` | Maximum messages sent per sliding day, per session. |
| `REACHOUT_MIN_INTERVAL_SECONDS` | `60` | Minimum interval between messages to distinct chats the session has never written to before. |
| `NEW_CHATS_PER_DAY` | `100` | Maximum first-time chats a session may start per day. |
| `SEND_QUIET_HOURS` | unset | Quiet-hours window in server-local time, format `HH:MM-HH:MM`, may wrap midnight. Empty disables. |
| `SEND_WARMUP_DAYS` | `14` | Days over which a new session ramps from the warm-up floor to full caps, based on its first-seen date. |
| `SEND_WARMUP_FLOOR_PERCENT` | `20` | Starting percentage of the caps for a new session. |

</details>

<details>
<summary><strong>Database</strong></summary>

The driver is validated at boot. `WAHA_DATABASE_DRIVER` accepts `sqlite`, `postgres` and
`postgresql` (trimmed, case-insensitive); unset still means `sqlite`. Any other value fails startup
naming the value received and the accepted list, and `mongo` fails with "MongoDB is not
implemented". There is no silent fallback to SQLite. Boot then logs one `Storage:` line naming the
driver and the concrete target of each store (the Postgres URL with its password redacted), connects
and creates the templates table and, on Postgres, the session store tables before serving. If the
database is unreachable, startup stops with the real error, so a bad URL or missing database fails
at startup instead of on the first chat or template read (commit `3391e17`).

| Variable | Default | Description |
| --- | --- | --- |
| `WAHA_DATABASE_DRIVER` | `sqlite` | `sqlite`, `postgres` or `postgresql`. Any other value, including `mongo`, fails the boot. |
| `WAHA_SQLITE_PATH` | `.sessions/waha.db` | Read by the config service getter only. The session store writes per-session `store.sqlite3` files under the local store directory. |
| `WAHA_DATABASE_URL` | unset | PostgreSQL connection string (driver `postgres`). |
| `WHATSAPP_SESSIONS_POSTGRESQL_URL` | unset | Alias for `WAHA_DATABASE_URL`. |
| `WHATSAPP_SESSIONS_MONGO_URL` | unset | Read by the config service getter only. MongoDB session storage is not implemented, so setting it has no runtime effect. |
| `WAHA_DB_TYPE` | `sqlite` | Dashboard database selection. Used as the driver when `WAHA_DATABASE_DRIVER` is unset; an unrecognised value fails the boot. |
| `WAHA_DB_HOST` | `localhost` | Reported DB host. |
| `WAHA_DB_PORT` | `5432` | Reported DB port. |
| `WAHA_DB_USERNAME` | unset | Reported DB username. |
| `WAHA_DB_NAME` | `./data/waha.sqlite` | Reported DB name. |
| `WAHA_DB_SSL` | `false` | Reported DB SSL flag. |

</details>

<details>
<summary><strong>Media and storage</strong></summary>

Downloaded media is persisted through the backend selected by `WAHA_STORAGE_TYPE` and served back
at `GET /api/files/:session/:filename`, which requires the same API key as the rest of the API.
Local media URLs expire after about 180 seconds; use S3 for durable links.

| Variable | Default | Description |
| --- | --- | --- |
| `WHATSAPP_FILES_FOLDER` | `/tmp/whatsapp-files` | Directory for downloaded media when `WAHA_STORAGE_TYPE=local` and `WAHA_STORAGE_LOCAL_PATH` is unset. |
| `WHATSAPP_DOWNLOAD_MEDIA` | `true` | Enable automatic media download. |
| `WHATSAPP_FILES_MIMETYPES` | unset | Comma-separated allowed MIME types. Empty means all. |
| `WHATSAPP_HEALTH_MEDIA_FILES_THRESHOLD_MB` | `100` | Media-files health threshold in MB. |
| `WHATSAPP_HEALTH_SESSION_FILES_THRESHOLD_MB` | `100` | Session-files health threshold in MB. |
| `WAHA_STORAGE_TYPE` | `local` | Media storage backend: `local` or `s3`. |
| `WAHA_STORAGE_LOCAL_PATH` | falls back to `WHATSAPP_FILES_FOLDER` and `/tmp/whatsapp-files` | Local media storage path. |
| `WAHA_LOCAL_STORE_BASE_DIR` | `.sessions` | Base directory for session auth data. |
| `WAHA_STORAGE_DIR` | `./data` | Directory for the internal SQLite databases (audit, templates, sending limits). |
| `AUDIT_RETENTION_DAYS` | `90` | Days to retain audit logs. `0` or negative disables retention. |
| `WAHA_S3_ENDPOINT` | unset | S3-compatible endpoint URL (for example MinIO). Leave unset for AWS S3. |
| `WAHA_S3_ACCESS_KEY` | unset | Access key id. |
| `WAHA_S3_SECRET_KEY` | unset | Secret access key. |
| `WAHA_S3_BUCKET` | unset | Bucket name. |
| `WAHA_S3_REGION` | `us-east-1` | Region. |

</details>

<details>
<summary><strong>Webhooks, proxy, queue and health</strong></summary>

| Variable | Default | Description |
| --- | --- | --- |
| `WAHA_WEBHOOK_URL` | unset | Default webhook URL for all sessions, overridable per session. |
| `WEBHOOK_SSRF_PROTECT` | `true` | Enable SSRF protection for webhook delivery. |
| `SSRF_ALLOWED_HOSTS` | unset | Comma-separated hosts or IPs allowed when SSRF protection is on. |
| `WHATSAPP_PROXY_SERVER` | unset | Single proxy server, format `protocol://host:port`. Global proxy variables are not consumed by the runtime; configure the proxy per session in the dashboard or session config. |
| `WHATSAPP_PROXY_SERVER_LIST` | unset | Comma-separated proxy list. |
| `WHATSAPP_PROXY_SERVER_INDEX_PREFIX` | unset | Index prefix for mapping sessions to proxies. |
| `WHATSAPP_PROXY_SERVER_USERNAME` / `WHATSAPP_PROXY_SERVER_PASSWORD` | unset | Proxy authentication. |
| `WAHA_QUEUE_ENABLED` | `false` | Redis-backed queue toggle. Reported only; no queue backend is bundled. |
| `WAHA_REDIS_HOST` | `localhost` | Reported Redis host. |
| `WAHA_REDIS_PORT` | `6379` | Reported Redis port. |
| `WAHA_REDIS_PASSWORD` | unset | Reported Redis password. |
| `MILO_API_URL` | `http://localhost:3003/api/webhooks/chatwoot/milo` | Milo API URL for Chatwoot webhook forwarding. |
| `WHATSAPP_HEALTH_MONGO_TIMEOUT_MS` | `3000` | MongoDB health-check timeout in milliseconds. |

</details>

<details>
<summary><strong>Unwired and legacy variables</strong></summary>

These are documented in `.env.example` but are read by nothing in the running server, or belong to
an export/import storage service that is not wired to a route. Setting them has no effect today.

| Variable | Default |
| --- | --- |
| `STORAGE_TYPE` | `local` |
| `STORAGE_LOCAL_PATH` | `./data/media` |
| `S3_ENDPOINT` | unset |
| `S3_BUCKET` | `waha-bun` |
| `S3_REGION` | `us-east-1` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | unset |
| `DATA_DIR` | `./data` |
| `EXPORT_IMPORT_MAX_BACKUPS` | unset |
| `STORAGE_IMPORT_MAX_BYTES` | `209715200` |
| `STORAGE_IMPORT_MAX_ENTRIES` | `100000` |

</details>

## Architecture

```mermaid
flowchart TD
    clients["Dashboard, WAHA clients,<br/>AI agents, Chatwoot"]
    serve["Bun.serve and Hono app"]
    routers["REST routers"]
    mcp["MCP server"]
    ws["WebSocket endpoint /ws"]
    core["SessionManager, webhook delivery,<br/>audit, templates, sending policy, media"]
    noweb["NOWEB engine over Baileys"]
    webjs["WEBJS engine over Puppeteer"]
    store["Session store on SQLite or Postgres"]
    disk["Media on local disk or S3"]
    auth[".sessions auth state"]

    clients --> serve
    serve --> routers & mcp & ws
    routers & mcp & ws --> core
    core --> noweb & webjs
    noweb & webjs --> store
    store --> disk & auth
```

- One Bun process serves the REST API, the WebSocket stream, the MCP endpoint and the compiled
  dashboard. Each session holds its WhatsApp engine connection in-process.
- The API mounts 185 route registrations across 29 router modules, plus `/mcp` and `/ws`.
- Auth state and the session index live in `.sessions`. Chats and messages go to SQLite (default,
  `bun:sqlite`) or PostgreSQL. `audit.db` and `sending-limits.db` always stay in local SQLite.
  Media goes to local disk or S3.
- Session statuses are `STOPPED`, `STARTING`, `SCAN_QR_CODE`, `WORKING` and `FAILED`.
- Webhooks are delivered inline with HMAC signing, idempotency keys, bounded retries and SSRF
  protection. There is no Redis dependency.

Requests walk this middleware chain, and a blocked send answers 429 with `Retry-After`:

```mermaid
sequenceDiagram
    Client->>Hono app: POST /api/sendText
    Hono app->>Middleware: logger, CORS, rate limit, 10 MB cap
    Note over Middleware: error handler wraps the chain, then API key auth, policies, session resolver
    alt missing or invalid credentials
        Middleware-->>Client: 401 authentication required
    else authorized
        Middleware->>Engine: CanSession send check, session resolved
        Engine->>Engine: sending policy gate
        alt blocked by policy
            Engine-->>Client: 429 with Retry-After
        else allowed
            Engine->>WhatsApp: send over the engine
            Engine-->>Client: 200 message payload
        end
    end
```

Sessions move through the five `WAHASessionStatus` values under the manager's lifecycle operations:

```mermaid
stateDiagram-v2
    [*] --> STOPPED
    STOPPED --> STARTING: start or restart
    STARTING --> SCAN_QR_CODE: QR code emitted
    STARTING --> WORKING: connection opens
    SCAN_QR_CODE --> WORKING: QR scanned
    STARTING --> FAILED: start failure or stuck
    SCAN_QR_CODE --> FAILED: closed before scan
    WORKING --> STARTING: reconnect
    WORKING --> STOPPED: stop, logout, force kill or restart
    FAILED --> STARTING: auto retry
    FAILED --> STOPPED: stop
    STOPPED --> [*]: delete
```

Webhook delivery runs inline with the SSRF guard, HMAC signing and bounded retries:

```mermaid
sequenceDiagram
    SessionManager->>WebhookDelivery: deliver event payload
    WebhookDelivery->>SSRF guard: resolveSafeFetchTarget
    alt blocked
        SSRF guard-->>WebhookDelivery: SsrfBlockedError
        WebhookDelivery->>Audit: webhook failed
    else allowed
        WebhookDelivery->>WebhookDelivery: HMAC-SHA256 signature, idempotency key
        WebhookDelivery->>Target: POST with 10 s timeout
        alt 5xx or network error
            WebhookDelivery->>WebhookDelivery: retry with exponential backoff
            WebhookDelivery->>Audit: webhook failed when retries run out
        else delivered
            WebhookDelivery->>Audit: webhook triggered
        end
    end
```

## Documentation

- [`vault/Home.md`](vault/Home.md): the maintained documentation vault (architecture, engines,
  endpoints, features, MCP tools, security model, known gaps and ops notes).
- [`vault/03 API/REST API.md`](vault/03%20API/REST%20API.md): route modules, path dialects and
  conventions.
- [`integrations/n8n-nodes-bunwa/README.md`](integrations/n8n-nodes-bunwa/README.md): n8n node
  installation, operations and workflow examples.
- [`.env.example`](.env.example): every environment variable with its default.
- `http://localhost:3000/api-docs/` while the server is running: interactive API reference.

## Troubleshooting

If chat or templates fail to load, check `WAHA_DATABASE_URL` first. A container that points at
`127.0.0.1` instead of the database service name (for example `postgres` in
`docker-compose.postgres.yml`) cannot reach the database. Since commit `3391e17` the boot validates
the driver and verifies the connection, so a current build exits at startup with the connection
error; an image built before that fix starts and fails later, when a chat or template is first read.

## Development

```bash
bun run test             # bun test --parallel src/, 222 pass and 1 skip across 26 files (commit 3391e17)
bun run typecheck        # tsc --noEmit
bun run lint             # oxlint src/
bun run build:frontend   # install frontend deps, tsc -b, vite build, copy to frontend-dist/
cd frontend && bun run build   # the same frontend build from the frontend package
```

`bun run test:postgres` runs the Postgres store smoke test against the server in
`WAHA_DATABASE_URL` (real Postgres, Docker, or PGlite), and `bun run postgres:dev` starts a local
PGlite Postgres that speaks the wire protocol on `127.0.0.1:5432`.

The driver conformance suite (`src/__tests__/conformance/`) runs the same assertions against SQLite
and PostgreSQL. The Postgres half starts an embedded PGlite server by default, so `bun run test`
needs no database service; set `BUNWA_TEST_POSTGRES_URL=postgres://user:pass@host:5432/db` to use a
real PostgreSQL or Docker service instead, or `BUNWA_TEST_EMBEDDED_PGLITE=0` to disable the embedded
server. When no server is available the half prints `SKIPPED` and is not a pass.

`scripts/verify-endpoints.ts` checks every route of a running server
(`BUNWA_URL=... BUNWA_API_KEY=... bun run scripts/verify-endpoints.ts`); it is read-only unless
`--include-writes --session <name> --confirm-live` is passed.

## License

BunWa is released under the **BunWa Community License (BCL) v1.0**. It is free to use, copy, modify
and self-host at no cost for personal projects, open-source projects, internal evaluation, learning,
non-commercial research, and non-profit or educational use. No fee or registration is required.

Commercial use, meaning running BunWa or a modified version as part of a product or service you
sell, resell, sublicense or otherwise use to generate revenue, requires a BunWa Commercial License:
**US $200 per month, per organization** (not per instance, server or seat), covering unlimited
internal deployments within that organization.

Contributions merged into this repository are licensed under the same terms and stay free and open
source for everyone. Forks are welcome, but a public fork may not add proprietary closed-source
features: that combination is what the commercial license covers.

Full terms: [LICENSE.md](LICENSE.md).

<div align="center">
  <sub>Built with ❤️ using <a href="https://bun.sh">Bun</a> + <a href="https://hono.dev">Hono</a></sub>
  <br />
  <sub>WhatsApp HTTP API Server</sub>
</div>

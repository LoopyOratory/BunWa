<p align="center">
  <img src="https://bun.sh/logo.svg" width="120" alt="Bun Logo" />
</p>

<h1 align="center">WAHA Bun</h1>

<p align="center">
  <strong>WhatsApp HTTP API — Bun/Hono + Baileys (NOWEB)</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api">API</a> •
  <a href="#apps--integrations">Apps</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#dashboard">Dashboard</a>
</p>

---

## Features

### Messaging
- Send text, images, videos, files, voice, locations, polls, contacts, buttons, lists
- Link previews with custom thumbnails
- Edit, delete, pin, star, forward messages
- Reactions, replies, typing indicators

### Contacts & Groups
- List, search, check contacts
- Block/unblock
- Full group management (create, participants, admins, invite codes, settings)

### Channels & Status
- Follow/unfollow, mute/unmute channels
- Post/delete text, image, video, voice statuses

### Integrations
- **Chatwoot** — built-in bidirectional bridge between WhatsApp and Chatwoot CRM
  - WhatsApp messages automatically appear as Chatwoot conversations
  - Agent replies in Chatwoot are delivered back to WhatsApp
  - Webhook endpoint for Chatwoot callbacks
  - Configurable per-session via dashboard or API

### Storage
- **bun:sqlite** — native high-performance SQLite
- PostgreSQL and MongoDB support for production
- In-memory store for development

### Real-time
- WebSocket event streaming (API key or Basic auth)
- Real-time message delivery, typing indicators, presence

### Security
- API key auth with timing-safe comparison
- Basic auth for dashboard
- Rate limiting (200 req/min API, 10 req/min login)
- Configurable CORS, 10MB body limits
- Session path-traversal prevention

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Install & Run

```bash
# Clone
git clone git@github.com:LoopyOratory/bun-native-waha-noweb-whatsapp.git
cd bun-native-waha-noweb-whatsapp

# Install deps
bun install

# Build frontend dashboard
bash scripts/build-frontend.sh

# Copy env config
cp .env.example .env
# Edit .env — at minimum set WAHA_API_KEY

# Start server
bun run src/main.ts
```

The server starts on `http://localhost:3000` (or `WHATSAPP_API_PORT` from `.env`).

### First Session

```bash
# Create
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "default"}'

# Start
curl -X POST http://localhost:3000/api/sessions/default/start

# Get QR code
curl http://localhost:3000/api/default/auth/qr
```

Scan the QR with WhatsApp (Settings → Linked Devices → Link a Device).

---

## API

All endpoints require `x-api-key` header authentication (or Basic auth if dashboard credentials are configured).

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/sessions/:name` | Get session info |
| `PUT` | `/api/sessions/:name` | Update session config |
| `DELETE` | `/api/sessions/:name` | Delete session |
| `POST` | `/api/sessions/:name/start` | Start |
| `POST` | `/api/sessions/:name/stop` | Stop |
| `POST` | `/api/sessions/:name/restart` | Restart |
| `POST` | `/api/sessions/:name/logout` | Logout |

### Pairing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/auth/qr` | Get QR code for scanning |
| `POST` | `/api/:session/auth/request-code` | Request pairing code (body: phoneNumber) |

### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sendText` | Send text message |
| `POST` | `/api/sendImage` | Send image |
| `POST` | `/api/sendFile` | Send file |
| `POST` | `/api/sendVoice` | Send voice |
| `POST` | `/api/sendVideo` | Send video |
| `POST` | `/api/sendLocation` | Send location |
| `POST` | `/api/sendPoll` | Send poll |
| `POST` | `/api/sendPollVote` | Vote on poll |
| `POST` | `/api/sendContactVcard` | Send contact |
| `POST` | `/api/sendButtons` | Send buttons |
| `POST` | `/api/sendList` | Send list |
| `POST` | `/api/sendLinkPreview` | Send link preview |
| `POST` | `/api/send/link-custom-preview` | Send link with custom preview |
| `POST` | `/api/reply` | Reply to message |
| `POST` | `/api/forwardMessage` | Forward message |
| `PUT` | `/api/reaction` | React to message |
| `PUT` | `/api/star` | Star/unstar message |
| `POST` | `/api/sendSeen` | Mark as read |
| `POST` | `/api/startTyping` | Start typing |
| `POST` | `/api/stopTyping` | Stop typing |
| `GET` | `/api/checkNumberStatus` | Check if number on WhatsApp |
| `GET` | `/api/:session/new-message-id` | Generate new message ID |

### Chats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/chats` | List chats (pagination) |
| `GET` | `/api/:session/chats/overview` | Chat overview |
| `GET` | `/api/:session/chats/:chatId` | Get chat |
| `DELETE` | `/api/:session/chats/:chatId` | Delete chat |
| `GET` | `/api/:session/chats/:chatId/messages` | Get messages |
| `POST` | `/api/:session/chats/:chatId/messages/read` | Mark read |
| `POST` | `/api/:session/chats/:chatId/messages/:id/pin` | Pin message |
| `POST` | `/api/:session/chats/:chatId/messages/:id/unpin` | Unpin |
| `DELETE` | `/api/:session/chats/:chatId/messages` | Clear messages |
| `DELETE` | `/api/:session/chats/:chatId/messages/:id` | Delete message |
| `PUT` | `/api/:session/chats/:chatId/messages/:id` | Edit message |
| `POST` | `/api/:session/chats/:chatId/archive` | Archive |
| `POST` | `/api/:session/chats/:chatId/unarchive` | Unarchive |
| `POST` | `/api/:session/chats/:chatId/unread` | Mark unread |

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/contacts/all` | List all contacts |
| `GET` | `/api/contacts/check-exists` | Check number exists |
| `GET` | `/api/contacts/about` | Get contact status |
| `GET` | `/api/contacts/profile-picture` | Get profile picture |
| `POST` | `/api/contacts/block` | Block contact |
| `POST` | `/api/contacts/unblock` | Unblock contact |
| `GET` | `/api/:session/contacts/:id` | Get contact by ID |
| `PUT` | `/api/:session/contacts/:chatId` | Update contact |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/groups` | List groups |
| `GET` | `/api/:session/groups/count` | Group count |
| `POST` | `/api/:session/groups` | Create group |
| `GET` | `/api/:session/groups/:id` | Get group |
| `GET` | `/api/:session/groups/:id/participants` | Participants |
| `POST` | `/api/:session/groups/:id/participants/add` | Add participants |
| `POST` | `/api/:session/groups/:id/participants/remove` | Remove participants |
| `POST` | `/api/:session/groups/:id/admin/promote` | Promote admin |
| `POST` | `/api/:session/groups/:id/admin/demote` | Demote admin |
| `POST` | `/api/:session/groups/:id/leave` | Leave group |
| `PUT` | `/api/:session/groups/:id/subject` | Set subject |
| `PUT` | `/api/:session/groups/:id/description` | Set description |
| `GET` | `/api/:session/groups/:id/invite-code` | Get invite code |
| `POST` | `/api/:session/groups/:id/invite-code/revoke` | Revoke invite code |
| `POST` | `/api/:session/groups/join` | Join via invite code |

### Channels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/channels` | List channels |
| `POST` | `/api/:session/channels` | Create channel |
| `GET` | `/api/:session/channels/:id` | Get channel |
| `DELETE` | `/api/:session/channels/:id` | Delete channel |
| `POST` | `/api/:session/channels/:id/follow` | Follow |
| `POST` | `/api/:session/channels/:id/unfollow` | Unfollow |
| `POST` | `/api/:session/channels/:id/mute` | Mute |
| `POST` | `/api/:session/channels/:id/unmute` | Unmute |
| `GET` | `/api/:session/channels/:id/messages/preview` | Preview messages |

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/:session/status/text` | Post text status |
| `POST` | `/api/:session/status/image` | Post image status |
| `POST` | `/api/:session/status/voice` | Post voice status |
| `POST` | `/api/:session/status/video` | Post video status |
| `DELETE` | `/api/:session/status/delete` | Delete status |

### Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/profile` | Get profile |
| `PUT` | `/api/:session/profile/name` | Set name |
| `PUT` | `/api/:session/profile/status` | Set status |
| `PUT` | `/api/:session/profile/picture` | Set picture |

### Labels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/labels` | List labels |
| `POST` | `/api/:session/labels` | Create label |
| `PUT` | `/api/:session/labels/:id` | Update label |
| `DELETE` | `/api/:session/labels/:id` | Delete label |
| `GET` | `/api/:session/labels/chats/:chatId` | Get chat labels |
| `PUT` | `/api/:session/labels/chats/:chatId` | Set chat labels |
| `GET` | `/api/:session/labels/:id/chats` | Get chats by label |

### Presence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/:session/presence` | Set presence |
| `GET` | `/api/:session/presence` | Get presences |
| `POST` | `/api/:session/presence/:chatId/subscribe` | Subscribe |

### Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/:session/calls/reject` | Reject incoming call |

### LIDs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/lids` | List LID mappings |
| `GET` | `/api/:session/lids/:lid` | Find phone by LID |
| `GET` | `/api/:session/lids/pn/:phone` | Find LID by phone |

### Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/:session/media/convert/voice` | Convert to voice format |
| `POST` | `/api/:session/media/convert/video` | Convert to video format |

### Observability

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/ping` | Ping (no auth) |
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/api/version` | Version info |
| `GET` | `/api/server/version` | Server version |
| `GET` | `/api/server/status` | Server status |
| `POST` | `/api/server/stop` | Graceful stop |

### API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/keys` | List API keys |
| `POST` | `/api/keys` | Create API key |
| `PUT` | `/api/keys/:id` | Update API key |
| `DELETE` | `/api/keys/:id` | Delete API key |

### Workers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/workers` | List workers |

### WebSocket

Connect to `ws://localhost:3000/ws` with `x-api-key` header or Basic auth query params.

| Query Param | Description |
|-------------|-------------|
| `session` | Session name or `*` for all |
| `events` | Comma-separated event types |

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?session=default&events=message,message.any', {
  headers: { 'x-api-key': 'your-key' }
});
ws.onmessage = (event) => console.log(JSON.parse(event.data));
```

---

## Apps & Integrations

### Chatwoot Bridge

Bidirectional sync between WhatsApp and Chatwoot CRM:

- **Incoming**: WhatsApp messages → Chatwoot conversations (auto-creates contacts)
- **Outgoing**: Chatwoot agent replies → WhatsApp messages
- Configured per-session via API or dashboard UI

#### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/apps` | List all app configs |
| `POST` | `/api/apps` | Create app (Chatwoot) |
| `GET` | `/api/apps/:id` | Get app config |
| `PUT` | `/api/apps/:id` | Update app config |
| `DELETE` | `/api/apps/:id` | Delete app |

#### Chatwoot Config

```json
{
  "session": "default",
  "app": "chatwoot",
  "enabled": true,
  "config": {
    "url": "http://chatwoot:3000",
    "accountId": 1,
    "accountToken": "cw_account_token",
    "inboxId": 1
  }
}
```

#### Chatwoot Webhook

Configure Chatwoot to send `message_created` events to:

```
POST /webhook/chatwoot/:session
```

Example: `http://waha:3001/webhook/chatwoot/default`

#### UI Configuration

Dashboard → Sessions → Click ⚙️ on a session → **Integrations** tab

---

## Architecture

```
src/
├── main.ts                         # Server entry point (Bun.serve + Hono)
├── api/                            # API route handlers
│   ├── apps.routes.ts              # Apps CRUD (/api/apps)
│   ├── sessions.routes.ts          # Session CRUD
│   ├── chatting.routes.ts          # Messaging
│   ├── chats.routes.ts             # Chat operations
│   ├── contacts.routes.ts          # Contacts
│   ├── groups.routes.ts            # Groups
│   ├── channels.routes.ts          # Channels
│   ├── status.routes.ts            # Status
│   ├── profile.routes.ts           # Profile
│   ├── labels.routes.ts            # Labels
│   ├── presence.routes.ts          # Presence
│   ├── websocket.ts                # WebSocket handler
│   └── ...
├── apps/                           # Built-in app integrations
│   └── chatwoot/
│       ├── api/chatwoot-webhook.routes.ts  # Webhook endpoint
│       ├── dto/chatwoot-config.dto.ts      # Type definitions
│       ├── services/ChatwootAppService.ts  # Core bridge logic
│       └── storage/                # App config persistence
├── core/
│   ├── manager.core.ts             # Session manager
│   ├── webhook-delivery.ts         # Webhook event delivery
│   ├── engines/noweb/              # NOWEB (Baileys) engine
│   └── storage/                    # bun:sqlite / Postgres / Mongo
├── middleware/
│   ├── api-key-auth.ts             # Timing-safe API key auth
│   ├── basic-auth.ts               # Dashboard basic auth
│   ├── rate-limit.ts               # In-memory rate limiter
│   └── error-handler.ts            # Global error handler
├── structures/                     # DTOs and types
├── di/container.ts                 # tsyringe DI setup
└── utils/                          # Utilities
```

### Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | Hono |
| WhatsApp | Baileys (@whiskeysockets/baileys, NOWEB engine) |
| Storage | bun:sqlite (native) / PostgreSQL / MongoDB |
| DI | tsyringe |
| Events | RxJS |
| Frontend | React 19 + Vite + shadcn/ui |
| Jobs | BullMQ (via ioredis) |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_API_PORT` | `3000` | Server port |
| `WAHA_API_KEY` | — | API key for auth |
| `WAHA_DASHBOARD_USERNAME` | — | Dashboard login user |
| `WAHA_DASHBOARD_PASSWORD` | — | Dashboard login password |
| `WAHA_CORS_ORIGIN` | — | Allowed CORS origins |
| `WAHA_LOG_LEVEL` | `info` | Log level |
| `WAHA_WEBHOOK_URL` | — | Global webhook URL |
| `WHATSAPP_START_SESSION` | — | Auto-start sessions (comma-separated) |
| `WHATSAPP_RESTART_ALL_SESSIONS` | `false` | Restore all sessions on reboot |
| `WAHA_DATABASE_DRIVER` | `sqlite` | Storage driver (sqlite/postgresql) |
| `REDIS_URL` | — | Redis for apps/workers (BullMQ) |

See `.env.example` for the full list.

---

## Dashboard

The web dashboard is at `/dashboard/` (or `/ui/`).

### Features
- **Sessions** — create, start, stop, delete, view QR codes
- **Chat** — real-time messaging UI with WebSocket
- **Event Monitor** — watch incoming events live
- **Integrations** — configure Chatwoot per-session (Integrations tab in Session Settings)
- **Workers** — connected instance status
- **API Docs** — built-in Scalar/OpenAPI explorer at `/api-docs/`

### Build

```bash
bash scripts/build-frontend.sh
```

---

## Development

```bash
# Dev mode with hot reload
bun --watch run src/main.ts

# Frontend dev (HMR)
cd frontend && bun run dev

# Tests
bun test

# Lint
bun run lint
```

---

## API Documentation

Interactive OpenAPI docs at `/api-docs/` when the server is running.

---

## License

MIT

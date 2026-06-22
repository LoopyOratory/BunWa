<p align="center">
  <img src="https://bun.sh/logo.svg" width="120" alt="Bun Logo" />
</p>

<h1 align="center">WAHA Bun</h1>

<p align="center">
  <strong>WhatsApp HTTP API powered by Bun</strong>
</p>

<p align="center">
  A blazing-fast, 1:1 API-compatible rewrite of WAHA using Hono framework and Bun runtime.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api">API</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#security">Security</a> •
  <a href="#deployment">Deployment</a>
</p>

---

## Features

### Messaging
- Send text, images, videos, files, voice messages
- Send locations, polls, contacts, buttons, lists
- Send link previews with custom thumbnails
- Edit, delete, pin, star, forward messages
- React to messages with emojis
- Reply to specific messages

### Contacts & Groups
- List, search, and check contacts
- Block/unblock contacts
- Create and manage groups
- Add/remove participants, promote/demote admins
- Set group description, subject, and picture
- Get and revoke group invite codes

### Channels & Status
- List, follow/unfollow, mute/unmute channels
- Search channels by text or view
- Post text, image, video, and voice statuses
- Delete statuses

### Storage & Security
- **bun:sqlite** — native high-performance SQLite (no knex dependency)
- In-memory store for development
- API key authentication with **timing-safe comparison**
- Session name sanitization (path traversal prevention)
- Rate limiting on all API endpoints
- Configurable CORS with credential support
- Request body size limits (10MB max)

### Real-time
- WebSocket event streaming (API key authenticated)
- Real-time message delivery
- Typing indicators
- Presence updates

### Webhooks
- Event delivery to configurable webhook URL
- Retries with exponential backoff
- Supports session status, message, and message.any events

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd waha-bun

# Install dependencies
bun install

# Copy environment config
cp .env.example .env

# Start the server
bun run src/main.ts
```

The server starts on `http://localhost:3000` by default.

### Create Your First Session

```bash
# Create a session
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"name": "my-session"}'

# Start the session
curl -X POST http://localhost:3000/api/sessions/my-session/start \
  -H "x-api-key: your-api-key"

# Get the QR code
curl http://localhost:3000/api/my-session/auth/qr \
  -H "x-api-key: your-api-key"
```

Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device).

---

## API

All API endpoints require authentication via `x-api-key` header.

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/sessions` | List all sessions |
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/sessions/:name` | Get session info |
| `PUT` | `/api/sessions/:name` | Update session config |
| `DELETE` | `/api/sessions/:name` | Delete session |
| `POST` | `/api/sessions/:name/start` | Start session |
| `POST` | `/api/sessions/:name/stop` | Stop session |
| `POST` | `/api/sessions/:name/restart` | Restart session |
| `POST` | `/api/sessions/:name/logout` | Logout session |

### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sendText` | Send text message |
| `POST` | `/api/sendImage` | Send image |
| `POST` | `/api/sendFile` | Send file |
| `POST` | `/api/sendVoice` | Send voice message |
| `POST` | `/api/sendVideo` | Send video |
| `POST` | `/api/sendLocation` | Send location |
| `POST` | `/api/sendPoll` | Send poll |
| `POST` | `/api/sendContactVcard` | Send contact |
| `POST` | `/api/sendButtons` | Send buttons |
| `POST` | `/api/sendList` | Send list |
| `POST` | `/api/sendLinkPreview` | Send link preview |
| `POST` | `/api/reply` | Reply to message |
| `POST` | `/api/forwardMessage` | Forward message |
| `PUT` | `/api/reaction` | React to message |
| `PUT` | `/api/star` | Star/unstar message |
| `POST` | `/api/sendSeen` | Mark as read |
| `POST` | `/api/startTyping` | Start typing indicator |
| `POST` | `/api/stopTyping` | Stop typing indicator |

### Chats

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/chats` | List chats |
| `GET` | `/api/:session/chats/overview` | Chat overview |
| `GET` | `/api/:session/chats/:id/messages` | Get messages |
| `POST` | `/api/:session/chats/:id/messages/read` | Mark as read |
| `POST` | `/api/:session/chats/:id/messages/:id/pin` | Pin message |
| `POST` | `/api/:session/chats/:id/messages/:id/unpin` | Unpin message |
| `DELETE` | `/api/:session/chats/:id/messages/:id` | Delete message |
| `PUT` | `/api/:session/chats/:id/messages/:id` | Edit message |
| `POST` | `/api/:session/chats/:id/archive` | Archive chat |
| `POST` | `/api/:session/chats/:id/unarchive` | Unarchive chat |

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/contacts/all` | List contacts |
| `GET` | `/api/contacts/check-exists` | Check number |
| `GET` | `/api/:session/contacts/:id` | Get contact |
| `PUT` | `/api/:session/contacts/:id` | Update contact |

### Groups

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/groups` | List groups |
| `POST` | `/api/:session/groups` | Create group |
| `GET` | `/api/:session/groups/:id` | Get group |
| `POST` | `/api/:session/groups/:id/leave` | Leave group |
| `GET` | `/api/:session/groups/:id/participants` | Get participants |
| `POST` | `/api/:session/groups/:id/participants/add` | Add participants |
| `POST` | `/api/:session/groups/:id/participants/remove` | Remove participants |
| `POST` | `/api/:session/groups/:id/admin/promote` | Promote admin |
| `POST` | `/api/:session/groups/:id/admin/demote` | Demote admin |
| `PUT` | `/api/:session/groups/:id/subject` | Set subject |
| `PUT` | `/api/:session/groups/:id/description` | Set description |
| `GET` | `/api/:session/groups/:id/invite-code` | Get invite code |

### Channels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/channels` | List channels |
| `POST` | `/api/:session/channels` | Create channel |
| `GET` | `/api/:session/channels/:id` | Get channel |
| `POST` | `/api/:session/channels/:id/follow` | Follow |
| `POST` | `/api/:session/channels/:id/unfollow` | Unfollow |
| `POST` | `/api/:session/channels/:id/mute` | Mute |
| `POST` | `/api/:session/channels/:id/unmute` | Unmute |

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/:session/status/text` | Post text status |
| `POST` | `/api/:session/status/image` | Post image status |
| `POST` | `/api/:session/status/video` | Post video status |
| `POST` | `/api/:session/status/voice` | Post voice status |
| `POST` | `/api/:session/status/delete` | Delete status |

### Profile

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/profile` | Get profile |
| `PUT` | `/api/:session/profile/name` | Set name |
| `PUT` | `/api/:session/profile/status` | Set status |

### Labels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/:session/labels` | List labels |
| `POST` | `/api/:session/labels` | Create label |
| `PUT` | `/api/:session/labels/:id` | Update label |
| `DELETE` | `/api/:session/labels/:id` | Delete label |
| `GET` | `/api/:session/labels/:id/chats` | Get chats by label |

### Presence

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/:session/presence` | Set presence |
| `GET` | `/api/:session/presence` | Get presences |
| `POST` | `/api/:session/presence/:chatId/subscribe` | Subscribe |

### WebSocket

Connect to `ws://localhost:3000/ws` with `x-api-key` header and query params:
- `session` — Session name or `*` for all
- `events` — Comma-separated event types

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?session=my-session&events=message,message.any', {
  headers: { 'x-api-key': 'your-api-key' }
});
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

---

## Architecture

```
src/
├── main.ts                    # Server entry point
├── api/                       # API route handlers
│   ├── sessions.routes.ts     # Session CRUD
│   ├── chatting.routes.ts     # Messaging endpoints
│   ├── chats.routes.ts        # Chat operations
│   ├── contacts.routes.ts     # Contact management
│   ├── groups.routes.ts       # Group management
│   ├── channels.routes.ts     # Channel operations
│   ├── status.routes.ts       # Status posting
│   ├── profile.routes.ts      # Profile management
│   ├── labels.routes.ts       # Label management
│   ├── presence.routes.ts     # Presence updates
│   └── websocket.ts           # WebSocket handler
├── core/
│   ├── engines/
│   │   └── noweb/             # NOWEB (Baileys) engine
│   │       ├── session.noweb.core.ts  # Session implementation
│   │       ├── store/         # Storage implementations
│   │       └── rxjs.ts        # Reactive event streams
│   ├── manager.core.ts        # Session manager
│   ├── webhook-delivery.ts    # Webhook event delivery
│   └── storage/
│       ├── bun-sqlite/        # Native bun:sqlite storage
│       └── sql/               # SQL abstractions
├── middleware/
│   ├── api-key-auth.ts        # Timing-safe API key auth
│   ├── basic-auth.ts          # Timing-safe basic auth
│   ├── error-handler.ts       # Global error handler
│   ├── rate-limit.ts          # In-memory rate limiter
│   ├── policies.ts            # CASL-based authorization
│   ├── session-resolver.ts    # Session resolution
│   └── validation.ts          # Zod request validation
├── structures/                # DTOs and type definitions
└── utils/                     # Utility functions
```

### Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Framework | Hono |
| WhatsApp | Baileys (@whiskeysockets/baileys) |
| Storage | bun:sqlite (native, high-performance) |
| DI | tsyringe |
| Validation | Zod |
| Events | RxJS |
| Frontend | React + Vite + shadcn/ui |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `WAHA_API_KEY` | — | API key for authentication (header only) |
| `WAHA_CORS_ORIGIN` | — | Comma-separated allowed origins |
| `WAHA_LOG_LEVEL` | `info` | Logging level |
| `WAHA_WEBHOOK_URL` | — | Webhook URL for event delivery |
| `WAHA_DEBUG_MODE` | `false` | Enable debug mode |

See `.env.example` for the full list of configuration options.

### Session Configuration

```json
{
  "name": "my-session",
  "config": {
    "noweb": {
      "store": {
        "enabled": true,
        "fullSync": true
      },
      "markOnline": true
    },
    "client": {
      "deviceName": "My Device",
      "browserName": "Chrome"
    }
  }
}
```

---

## Deployment

### Docker

```bash
docker build -t waha-bun .
docker run -p 3000:3000 -e WAHA_API_KEY=your-secret-key waha-bun
```

### Docker Compose

```yaml
version: '3.8'
services:
  waha:
    build: .
    ports:
      - "3000:3000"
    environment:
      - WAHA_API_KEY=your-secret-key
    volumes:
      - ./sessions:/app/.sessions
```

---

## Security

- **Authentication**: API key required via `x-api-key` header (timing-safe comparison)
- **Authorization**: Session-level ownership enforcement — users can only access their own sessions
- **Rate Limiting**: 200 req/min on API, 10 req/min on dashboard login
- **CORS**: Configurable origin via `WAHA_CORS_ORIGIN` env var
- **Input Validation**: Session names sanitized (no path traversal characters)
- **Body Limits**: 10MB max request size
- **Docker**: Runs as non-root user (uid 1001)
- **Error Handling**: Internal errors never exposed to clients

---

## Dashboard

The built-in dashboard is available at `/ui` when the server is running.

Features:
- Session management (create, start, stop, delete)
- QR code scanning
- Real-time chat interface
- Event monitoring
- Worker status

---

## Development

```bash
# Install dependencies
bun install

# Start in development mode (with hot reload)
bun --watch run src/main.ts

# Run tests
bun test

# Lint
bun run lint

# Build frontend
cd frontend && bun run build
```

---

## API Documentation

Interactive API documentation is available at `/api-docs/` when the server is running.

---

## License

MIT

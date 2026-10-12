# Uploads for media sends + NOWEB history sync — design

Date: 2026-10-12 · Status: approved in chat, pending spec review

## Why

1. **Media sends get stuck at the transport step.** Every send already accepts an http(s) URL, a
   data URL, base64 or a *server-side* path. An MCP client (an AI agent) can only move bytes by
   pasting base64 through the model, which is impractical past a few tens of KB, and a caller
   without the API key cannot reach the REST API at all. On 2026-10-12 this blocked sending
   22 ad cards (18 MB zip) from a local machine to a WhatsApp group.
2. **NOWEB history sync is invisible.** `noweb.store.fullSync` exists and the persistent store
   handles `messaging-history.set`, but it is off by default, nobody can see whether history
   arrived, and there is no event when it finishes.

## Part 1 — Upload store and upload tickets

### Model

An **upload** is a file stored server side for one session, referenced by an id:

```
UploadRecord { id, session, filename, mimetype, size, createdAt, expiresAt }
```

Stored at `<localMediaFolder>/<session>/uploads/<id>` with a `<id>.json` metadata sidecar.
`id` = `Bun.randomUUIDv7()` (time-ordered, unguessable enough as a reference; access still needs
auth). A cleanup sweep runs every 10 min and on boot, deleting records past `expiresAt`.

An **upload ticket** is a single-use, short-lived credential that lets anyone holding the URL
upload one file into one session's upload store, without the API key.

```
UploadTicket { tokenHash (sha256), session, maxBytes, filename?, expiresAt, used }
```

Kept in memory (lost on restart is acceptable — tickets live minutes). The raw token is only
returned once, in the URL.

### Config

| Env | Default | Meaning |
|---|---|---|
| `UPLOAD_MAX_BYTES` | `104857600` (100 MB) | cap for one upload (WhatsApp documents allow more; 100 MB keeps memory sane) |
| `UPLOAD_TTL_SECONDS` | `86400` | how long an upload is kept |
| `UPLOAD_TICKET_TTL_SECONDS` | `900` | how long a ticket URL is valid |
| `WAHA_BASE_URL` (existing) | derived from the request | used to build absolute ticket URLs; falls back to the request origin |

The global `maxRequestBodySize` rises to `UPLOAD_MAX_BYTES`, but the existing fast
`Content-Length` check keeps **10 MB for every `/api/*` route except the two upload routes**. The
413 mapping in `error-handler.ts` stays as is.

### REST

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/{session}/uploads/tickets` | API key | body `{filename?, maxBytes?}` → `{uploadUrl, expiresAt, maxBytes, curl}` |
| `PUT /uploads/{token}` | ticket token | raw body streamed to disk; `?filename=` or `X-Filename` header optional → `UploadRecord` |
| `POST /api/{session}/uploads` | API key | `multipart/form-data` field `file` (dashboard / scripts) → `UploadRecord` |
| `GET /api/{session}/uploads` | API key | list live uploads |
| `GET /api/{session}/uploads/{id}` | API key | one record |
| `DELETE /api/{session}/uploads/{id}` | API key | delete now |

The `PUT` route lives at `/uploads/{token}`, outside `/api`: every router mounted at `/api` applies the API-key middleware to all `/api/*` paths, so a token-only route cannot live there. It validates the token itself. It
rejects: unknown/expired/used token (401), body over the ticket's `maxBytes` (413, partial file
removed), empty body (422). The ticket is marked used before streaming starts, so a URL works once.

`curl` in the ticket response is a ready command:
`curl -sS -T <FILE> '<uploadUrl>'` (with `?filename=` when given).

Mimetype: from the declared filename's extension, else `Bun.file().type`, else
`application/octet-stream`. Session names and ids pass the same traversal guards as
`files.routes.ts`.

### Using an upload in a send

Any media `file` field accepts:

- `"upload:<id>"` (string), or
- `{ "upload": "<id>", "filename"?: "...", "mimetype"?: "..." }` (object; explicit values win).

A single resolver, `resolveUploadRefs(session, request)` in `src/core/uploads/`, runs **in the
route layer and MCP handlers before the engine call** and replaces the reference with
`{ data: Buffer, mimetype, filename }`, which both engines accept (WEBJS's `fileToBuffer` gains a `Buffer.isBuffer(file.data)` branch; today it
would misread binary data containing a comma). Fields covered:
`file` on image/file/video/voice sends and status image/video/voice sends. Not button `headerImage`: NOWEB treats header media as a Plus-only stub today.
Unknown or expired id, or an id from another session → 422 with a clear message. Uploads are not
deleted after sending (the same upload can go to several chats); TTL handles cleanup.

### MCP

| Tool | Tier | Notes |
|---|---|---|
| `UploadCreateTicket` | write | returns `{uploadUrl, expiresAt, maxBytes, curl}`; description tells the agent to run the curl from its shell, then send with `upload:<id>` |
| `UploadList` | read | live uploads for the session |
| `UploadDelete` | write | delete one |

All three are `sessionScoped`, so a session-scoped MCP key only touches its own uploads. The
`file` descriptions on every send tool gain: "or `upload:<id>` from UploadCreateTicket for local
files of any size".

### Dashboard

Not in scope beyond what the multipart route enables. (A later UI can POST to it.)

## Part 2 — NOWEB full history sync at link time

### Behaviour

- `noweb.store.fullSync` defaults to **true** when unset (a stored `false` is kept). The
  dashboard toggle defaults to on for new sessions. Baileys gets `syncFullHistory: true` and a
  `shouldSyncHistoryMessage` that accepts every history sync type.
- History only arrives right after a device is **linked** (QR/pairing). Re-syncing an already
  linked session means re-linking; the status says so.

### Sync tracker

`HistorySyncTracker` (per session, `src/core/engines/noweb/store/`) listens to
`messaging-history.set` alongside the store and records:

```
{ state: 'idle' | 'syncing' | 'complete',
  startedAt, updatedAt, completedAt,
  batches, messages, chats, contacts,
  progress (0-100 | null), syncType (last seen), isLatest }
```

`complete` = Baileys reports `isLatest`/progress 100, or no batch for 2 minutes after at least one
batch (WhatsApp does not always send a final marker). Persisted as `history-sync.json` in the
session directory so it survives restarts. Counts are what the store actually wrote (the tracker
is fed after `syncMessagesHistory` resolves, not before).

### Surfaces

- `GET /api/{session}/sync` → the tracker state (WEBJS sessions return
  `{state: 'unsupported'}`).
- Event `session.sync` (new `WAHAEvents.SESSION_SYNC`) on webhooks and WebSocket, emitted on the
  first batch, at most every 5 s while syncing, and once on completion.
- MCP `SessionSyncStatus` (read, sessionScoped).
- Dashboard: the session card shows "Syncing history 42%" / "History synced" from the endpoint.

## Error handling

- Upload write failures delete the partial file and record.
- Disk full / I/O errors → 500 with the message; nothing half-registered.
- Tracker failures are logged and never break the store or the socket.

## Testing

- Unit: upload store (save, ttl sweep, traversal guards), ticket lifecycle (single use, expiry,
  size cap → 413 and cleanup), resolver (string and object forms, cross-session 422, explicit
  filename/mimetype win), body-limit split (10 MB elsewhere, `UPLOAD_MAX_BYTES` on upload routes).
- Unit: tracker fed simulated `messaging-history.set` batches → counts, progress, idle-timeout
  completion, persistence across reload; status route and event emission.
- MCP: tool registration, session scoping, end-to-end ticket → PUT → `MessageSendFile` with
  `upload:<id>` against a mocked session.
- Live: upload the 18 MB ad zip via ticket + curl, send to the test number 15551234567, confirm it
  opens. History sync verified on the next fresh link.

## Docs

Vault: `05 MCP/MCP Tools Reference.md`, `03 API/Endpoints by Domain.md`,
`02 Engines/NOWEB Engine.md`, `02 Engines/Session Stores.md`,
`08 Ops/Configuration Reference.md`, `09 Development/Fix History.md`. Plus README, OpenAPI
(`src/swagger.ts`), CHANGELOG.

## Out of scope

On-demand backfill of older chats for already-linked sessions; mirroring phone-sent
edits/deletes; a dashboard upload UI; S3 storage for uploads (local media folder only for now).

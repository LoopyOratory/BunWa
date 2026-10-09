---
type: note
section: architecture
tags: [bunwa, architecture, storage, ops]
updated: 2026-10-09
source: src/core/storage/ (incl. storage-report.ts, storage-bootstrap.ts), src/core/engines/noweb/store/, src/core/media/, src/config.service.ts
---

# 🗄️ Data and Storage

Four different things persist state, in four different places. Knowing which is which prevents
the classic "I backed up the wrong folder" incident.

## On-disk layout

```text
<WAHA_LOCAL_STORE_BASE_DIR or ./.sessions>       # session auth + index
├── .sessions-index.json                         # every session's config + last known _status
├── noweb/<session>/                             # NOWEB engine data
│   ├── creds.json, app-state-sync-*.json, ...   # Baileys multi-file auth state
│   └── store.sqlite3                            # per-session message/chat/contact store
└── webjs/                                       # whatsapp-web.js LocalAuth (clientId = session)
└── chatwoot-apps.json                           # Chatwoot app configs (JSON file repo)

<WAHA_STORAGE_DIR or ./data>                     # internal databases
├── audit.db                                     # audit log (bun:sqlite, WAL)
└── templates.db                                 # message templates (bun:sqlite, WAL)

<WAHA_STORAGE_LOCAL_PATH | WHATSAPP_FILES_FOLDER | /tmp/whatsapp-files>
└── <session>/<messageId>.<ext>                  # downloaded/outgoing media, ~180 s lifetime
```

`AuditService` creates `WAHA_STORAGE_DIR` if missing (that is the fresh-clone boot fix — it used to
crash with `SQLITE_CANTOPEN` on first run), and `scripts/start.sh` also `mkdir -p data`.

## The two message stores (NOWEB)

| Mode | Trigger | Behaviour |
|---|---|---|
| **Persistent** (default) | `sessionConfig.noweb.store.enabled !== false` | `NowebPersistentStore` binds Baileys events to SQLite/Postgres repositories: chats, contacts, messages, groups, labels, LID↔PN mapping, history sync |
| **In-memory** | `noweb.store.enabled = false` | Baileys-style KeyedDB store; chat/contact/label/LID queries throw `BadRequestException` telling you to enable `noweb.store.enabled` / full sync |

See [[Session Stores]] for the driver matrix and the per-repository file list.

## Media

- `MediaManager.processMedia()` filters by `WHATSAPP_FILES_MIMETYPES`, stores through an
  `IMediaStorage` implementation and returns `{url, mimetype, filename}`.
- **Local** (default): `MediaLocalStorage` writes to `<folder>/<session>/<id>.<ext>` and serves
  `GET /api/files/:session/:filename` (api-key protected, path-traversal guarded). Files get a
  **~180 s lifetime** then are unlinked — treat the URL as ephemeral.
- **S3** (Plus-flavoured): presigned GET URLs, 1 h expiry, key `{session}/{messageId}.{ext}`
  ([[Plus Tier]]).
- **Postgres BYTEA** storage exists (`PostgresMediaStorage`) but is deliberately not connected.
- Voice conversion shells out to **ffmpeg** (OGG/Opus, 32 kbps, 48 kHz mono) — required in the image,
  and `sendVoice` with `convert=true` fails without it.

## Database switches

> Two sets of variables describe "the database". They are wired together: the Infrastructure page
> writes the canonical pair on save, and the `WAHA_DB_*` fields feed a runtime fallback.

| Variable | Role | Notes |
|---|---|---|
| `WAHA_DATABASE_DRIVER` | **the runtime switch** — NOWEB store selection | `sqlite` (default) or `postgres`/`postgresql`; read by `NowebStorageFactoryCore` |
| `WAHA_DATABASE_URL` / `WHATSAPP_SESSIONS_POSTGRESQL_URL` | Postgres connection for the above | either name works; an explicit URL wins |
| `WAHA_DB_TYPE` + `WAHA_DB_HOST/PORT/USERNAME/PASSWORD/NAME/SSL` | the Infrastructure page's fields | saving writes the canonical keys too; if only these are set (older saves), they are honoured and the URL is built from the fields |

**Unknown driver values are startup errors (loud, no fallback).** `getDatabaseDriver()` accepts only
`sqlite`, `postgres` and `postgresql` (trimmed, case-insensitive) plus an unset default of `sqlite`.
Any other value — a typo like `pg`, or `mongo`, which is not implemented — throws naming the value
received and the accepted values. The factories have no SQLite fallback path. Same for an
unrecognised `WAHA_DB_TYPE`. Don't set `mongo`: it fails the boot with "MongoDB is not implemented".

**Boot is self-diagnosing and fail-fast.** Right after config load, `src/main.ts` logs one line:
`Storage: driver=... sessions-auth=... sessions-chat=... templates=... audit=... sending-policy=...`
with the concrete target of each store (SQLite paths, or the Postgres URL with the password
replaced by `***`). `verifyStorageAtBoot()` then connects for the configured driver, creates the
NOWEB store tables and the templates table (or the SQLite templates table), and exits with the real
error when the URL, database or driver is bad — instead of failing on the first session start or
template read.

The Infrastructure page is therefore a real switch: saving PostgreSQL writes
`WAHA_DATABASE_DRIVER=postgres` + derives `WAHA_DATABASE_URL` from the form (credentials
percent-encoded, `?sslmode=require` when SSL is on). Sessions **started after saving** use the new
backend immediately; restart the server to apply it everywhere. Nothing is migrated between
backends. Verified end-to-end on 2026-09-29 ([[Postgres on PGlite]]).

**Per-session isolation (since 2026-10-09).** Each NOWEB session keeps its chats, contacts, messages,
groups, labels and LID map in its **own Postgres schema**, `bunwa_<session>` (case kept; names past
the 63-byte identifier limit become `bunwa_<first 40 chars>_<12-char hash>`). Every query names the
schema explicitly (`schemaScopedKnex` in `PostgresStorage.ts`), so isolation does not depend on
`search_path`, which PGlite shares across connections. Before this, all sessions shared one table set
in `public` with no session column: one session's chat list showed every session's chats, and rows
of deleted sessions never went away.

- The database user needs `CREATE` on the database (`GRANT CREATE ON DATABASE <db> TO <user>`);
  `verifyStorageAtBoot()` checks this and stops startup with that message otherwise.
- The old shared tables in `public` are no longer read or written. Boot logs a warning while they
  exist; drop them when you no longer need the archive. Existing history was **not** migrated:
  sessions start with an empty store and fill as messages arrive.
- Deleting (or logging out) a session drops its schema on Postgres and removes its
  `store.sqlite3` (+ `-wal`/`-shm`) on SQLite, so a new session with the same name starts empty.
  Credentials in the session directory are left alone.
- Templates stay in one shared `templates` table in `public`.

`WHATSAPP_SESSIONS_MONGO_URL` and `WAHA_SQLITE_PATH` have getters in `WhatsappConfigService` but no
runtime consumer; setting `WAHA_DATABASE_DRIVER=mongo` now stops startup instead of silently
running SQLite.

## Backup / migration

- **Session data** → back up `.sessions/` (or whatever `WAHA_LOCAL_STORE_BASE_DIR` points at) while
  the process is stopped; it holds the WhatsApp credentials, i.e. the account pairing.
- **With `WAHA_DATABASE_DRIVER=postgres`** → the session store (chats, messages, contacts, labels, …)
  lives in the Postgres database instead; include it in backups. The template repository follows the
  same driver.
- **Operational history** → `data/audit.db` and `data/templates.db`.
- **Media** → ephemeral by design; only S3 storage produces durable URLs.
- `src/core/export-import.service.ts` implements a tar.gz export/import with entry and size caps,
  but **no route exposes it** ([[Known Gaps and Stubs]]).

## Related

[[Session Stores]] · [[Audit Log]] · [[Templates and Bulk Send]] · [[Docker and Deployment]] · [[Configuration Reference]]

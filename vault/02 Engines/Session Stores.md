---
type: note
section: engines
tags: [bunwa, engine, storage, database]
updated: 2026-09-14
source: src/core/engines/noweb/store/
status: shipped
---

# 💾 Session Stores

The NOWEB engine persists WhatsApp state (chats, contacts, messages, groups, labels, LID mapping)
through the store layer under `src/core/engines/noweb/store/`.

## Choosing a store

Two independent decisions:

**1 — persistent or in-memory** (`ensureStore()` in the engine, driven by session config):

| Mode | Config | Behaviour |
|---|---|---|
| Persistent (default) | `noweb.store.enabled: true` | `NowebPersistentStore` — binds every Baileys event to repositories; supports full history sync, group cache with a 24 h TTL + `groupFetchAllParticipating` |
| In-memory | `noweb.store.enabled: false` | `NowebInMemoryStore` wrapping Baileys' KeyedDB `make-in-memory-store`; **chat/contact/label/LID queries throw `BadRequestException`** telling you to enable the store or full sync — groups still work live off the socket |

**2 — which driver** (`NowebStorageFactoryCore.createStorage`):

```text
WAHA_DATABASE_DRIVER = postgres | postgresql   →  PostgresStorage(WHATSAPP_SESSIONS_POSTGRESQL_URL || WAHA_DATABASE_URL)
anything else (default sqlite)                 →  Sqlite3Storage at <sessionDir>/store.sqlite3
```

> `WAHA_DATABASE_DRIVER` is the switch. `WAHA_DB_TYPE` on the Infrastructure page is *not* —
> see [[Data and Storage#Database switches — ⚠️ two of them]].

## Interface

`INowebStorage` (`store/INowebStorage.ts`) exposes `init()`, `close()`, `runInTransaction()` and one
repository per entity: contacts, chats, groups, messages, labels, label associations, LID↔PN.
`INowebStore.ts` is the higher-level view the engine consumes.

## Drivers

### `sqlite3/` — default

- `Sqlite3Storage` on **`bun:sqlite`**, WAL mode, migrations from `store/schemas.ts`, schema validation on boot.
- Repositories: `Sqlite3ChatRepository`, `Sqlite3ContactRepository`, `Sqlite3GroupRepository`,
  `Sqlite3MessagesRepository`, `Sqlite3LabelsRepository`, `Sqlite3LabelAssociationsRepository`,
  `Sqlite3LidPNRepository`.
- Base class `NOWEBBunSqliteKVRepository`.

### `postgres/`

- `PostgresStorage` on a Knex/pg pool; tables created with raw SQL; mirrors the sqlite repositories
  (`Postgres*Repository`, including `PostgresLidPNRepository`).
- ⚠️ `runInTransaction()` is a **passthrough** — it calls the callback with no `BEGIN`/`COMMIT`
  ("best effort" per the source comment), so batch writes are not atomic on Postgres.

### `memory/`

Baileys-style in-memory `KeyedDB` store (≈560 lines) — the fastest option, no durability.

### `sql/`

⚠️ Not a driver. It holds shared query mixins: `SqlLabelAssociationsMethods` is used by the sqlite3
label-association repo, while `SqlChatMethods.ts` and `SqlMessagesMethods.ts` are **unused dead code**.

## Shared pieces

| File | Role |
|---|---|
| `NowebPersistentStore.ts` | the default store (≈830 lines): event binding, history sync, upserts, group cache, LID sync, transaction wrapper |
| `store/metadata.ts` | column extractors for messages and label associations |
| `store/utils.ts` | KV helpers |
| `store/schemas.ts` | schema definitions + migrations |

## Related

[[Data and Storage]] · [[NOWEB Engine]] · [[Configuration Reference]] · [[Known Gaps and Stubs]]

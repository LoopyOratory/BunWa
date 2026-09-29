---
type: note
section: ops
tags: [bunwa, ops, postgres, testing]
updated: 2026-09-29
source: scripts/test-postgres.ts, scripts/pglite-dev.ts, src/core/db/knex-postgres.ts
status: shipped
---

# 🐘 Postgres on PGlite

The Postgres driver (`WAHA_DATABASE_DRIVER=postgres`) had never run before 2026-09-29 — no
deployment, CI job or test touched it. This note is the working recipe (embedded WASM Postgres, no
Docker needed), the verified test matrix, and the two bugs the first live run surfaced.

**TL;DR**

```bash
bun run postgres:dev                      # PGlite (PostgreSQL 18 in WASM) on 127.0.0.1:5432
export WAHA_DATABASE_DRIVER=postgres
export WAHA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
bun run src/main.ts                       # BunWa, engine + store on Postgres
WAHA_DATABASE_URL=... bun run test:postgres   # 10 checks against any live Postgres
```

## What was verified (2026-09-29)

| Layer | Result |
|---|---|
| Driver switch | `WAHA_DATABASE_DRIVER=postgres` selects `PostgresStorage`; missing URL throws a clear error |
| Schema migration | `init()` creates `contacts, chats, groups, messages, labels, labelAssociations, lid_map` |
| All seven repositories | CRUD + upserts (`bun run test:postgres`, 10/10) |
| Templates | `PostgresTemplateRepository`: REST create/list, session isolation, MCP `TemplateList` |
| Engine boot | Session start reaches `SCAN_QR_CODE` — zero knex errors, tables created on the way up |
| Fix regressions | `knex-postgres.test.ts` pins the driver-resolution fix; `bun test` 176/0 |

Not covered by this pass: live message flow (needs a paired WhatsApp account) and label API routes
(they require a WORKING session — use `test:postgres` to exercise those repositories instead).

## The PGlite server

`@electric-sql/pglite` 0.5.8 — PostgreSQL 18.3 compiled to WASM — plus
`@electric-sql/pglite-socket`, which exposes it over the real Postgres wire protocol, so knex/pg
connects unchanged. Committed as `scripts/pglite-dev.ts` (`bun run postgres:dev`):

```ts
const db = new PGlite(process.env.PGLITE_DATA_DIR ?? './.pglite');
const server = new PGLiteSocketServer({
  db, port: 5432, host: '127.0.0.1',
  maxConnections: 16,   // knex pools are min 2 / max 10
});
await server.start();
```

Env: `PGLITE_PORT` (default 5432), `PGLITE_DATA_DIR` (default `./.pglite`, gitignored).

Caveats: queries serialise through one in-process queue (fine for testing, not a production server),
it is single-machine only, and port 5432 conflicts with a real Postgres if one is running.

## Bugs found on the first run (both fixed)

1. **`Cannot find module 'pg'` on every session start.** knex loads its driver with a bare
   `require('pg')` evaluated inside its own module directory. Under bun's isolated linker
   (`bunfig.toml`) that directory lives in the shared install cache with no `pg` link — knex never
   declares pg as a dependency or peer, so the isolated layout has no reason to create one. Fix:
   `src/core/db/knex-postgres.ts` — `BunPgClient._driver()` returns the app-imported `pg`; both
   knex call sites go through `makePostgresKnex()`. Layout-independent: hoisted and isolated
   installs behave identically.
2. **Every message write failed**: `.onConflict(['jid', 'id'])` matched no unique index — only
   `messages_id_index` is unique. Fix: `.onConflict('id')`, matching the schema and the SQLite
   OR-REPLACE behaviour.

## Behaviour worth remembering

- **One global table set per database** — all sessions of an instance share rows. SQLite gives each
  session its own file; Postgres does not. Single-session deployments are unaffected.
- `runInTransaction()` is a passthrough — batch writes are not atomic ([[Known Gaps and Stubs]]).
- Postgres media storage and the Postgres/Mongo auth repositories remain intentionally unwired.
- The driver only swaps the NOWEB session store and the template repository; policies, API keys and
  audit stay in the local SQLite files.

## Related

[[Session Stores]] · [[Data and Storage]] · [[Testing]] · [[Configuration Reference]] · [[Fix History]]

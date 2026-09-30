#!/usr/bin/env bun
/**
 * Embedded PostgreSQL (PGlite) over the Postgres wire protocol.
 *
 * Lets you run BunWa against the real Postgres driver without installing or
 * running a Postgres server — PGlite is PostgreSQL 18 compiled to WASM, and
 * the socket server speaks the wire protocol knex/pg already use.
 *
 * Usage:
 *   bun run postgres:dev                      # 127.0.0.1:5432, data in ./.pglite
 *   PGLITE_PORT=5433 bun run postgres:dev
 *
 * Then point BunWa at it:
 *   WAHA_DATABASE_DRIVER=postgres \
 *   WAHA_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
 *   bun run src/main.ts
 *
 * Verify any deployment (this server, Docker Postgres, real Postgres):
 *   WAHA_DATABASE_URL=... bun run test:postgres
 *
 * See the vault note "Postgres on PGlite" for the test matrix and caveats.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dataDir = process.env.PGLITE_DATA_DIR ?? './.pglite';
const port = Number(process.env.PGLITE_PORT ?? 5432);

const db = new PGlite(dataDir);
await db.waitReady;

const server = new PGLiteSocketServer({
  db,
  port,
  host: '127.0.0.1',
  // knex pools default to min 2 / max 10; anything >= 10 works here.
  maxConnections: 16,
});

await server.start();
console.log(
  `PGlite ready — postgres://postgres:postgres@127.0.0.1:${port}/postgres (data: ${dataDir})`,
);

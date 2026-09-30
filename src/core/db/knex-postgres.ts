/**
 * Knex factory for PostgreSQL.
 *
 * Why this file exists: knex loads its pg driver with a bare `require('pg')`
 * evaluated *inside knex's own module directory*. Bun's isolated linker
 * (bunfig.toml `linker = "isolated"`) resolves a package's requires from its
 * real location in the shared install cache, where no `pg` exists: knex does
 * not declare pg as a dependency or peer (it supports many dialects), so the
 * isolated layout has no reason to link one. The bare require then fails at
 * runtime with "Cannot find module 'pg'" even though pg is installed in the
 * project.
 *
 * Subclassing knex's Postgres client and returning the app-imported `pg` from
 * `_driver()` makes driver resolution independent of node_modules layout:
 * isolated installs (this repo) and hoisted installs (npm, plain bun, CI)
 * behave identically.
 *
 * Every knex instance in the codebase must be created through this factory.
 */
import Knex from 'knex';
import pg from 'pg';
import ClientPg from 'knex/lib/dialects/postgres/index.js';

// CJS/ESM interop: the deep module exports the class as module.exports, which
// Bun surfaces either directly or under .default depending on resolution.
const ClientPostgres: any = (ClientPg as any)?.default ?? ClientPg;

export class BunPgClient extends ClientPostgres {
  _driver() {
    return pg;
  }
}

export function makePostgresKnex(connectionString: string): Knex.Knex {
  return (Knex as any)({
    client: BunPgClient,
    connection: connectionString,
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 60_000,
      createTimeoutMillis: 120_000,
      acquireTimeoutMillis: 120_000,
    },
  });
}

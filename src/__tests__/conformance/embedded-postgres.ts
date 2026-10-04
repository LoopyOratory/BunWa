import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

/**
 * Embedded PostgreSQL for the conformance suite.
 *
 * PGlite is PostgreSQL compiled to WASM, and pglite-socket exposes it over the
 * Postgres wire protocol. The project's knex factory and pg driver connect to
 * it exactly as they would to a server, so the postgres code path is exercised
 * without installing or running PostgreSQL. This was verified against the
 * repo's isolated install layout (see the commit message).
 *
 * The database is in-memory and the listener binds 127.0.0.1 on an ephemeral
 * port, so tests need no external service and no outbound network access.
 */
export interface EmbeddedPostgres {
  url: string;
  stop(): Promise<void>;
}

export async function startEmbeddedPostgres(): Promise<EmbeddedPostgres> {
  const db = new PGlite();
  await db.waitReady;
  const server = new PGLiteSocketServer({
    db,
    port: 0,
    host: '127.0.0.1',
    // knex pools default to min 2 and can grow to 10; the socket server must
    // accept all of them because PGlite queues queries per connection.
    maxConnections: 16,
  });
  await server.start();

  // getServerConn() is host:port, with the real port after a port 0 bind.
  const hostPort = server.getServerConn();
  return {
    url: `postgres://postgres:postgres@${hostPort}/postgres`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}

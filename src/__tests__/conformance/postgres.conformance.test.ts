import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PostgresStorage } from '../../core/engines/noweb/store/postgres/PostgresStorage';
import { PostgresTemplateRepository } from '../../core/templates/postgres/PostgresTemplateRepository';
import { startEmbeddedPostgres, type EmbeddedPostgres } from './embedded-postgres';
import { runDriverConformance } from './conformance.shared';

/**
 * PostgreSQL half of the shared driver conformance suite.
 *
 * Server resolution, in order:
 *   1. BUNWA_TEST_POSTGRES_URL, for a real PostgreSQL or a Docker service. A
 *      failure here is a test failure, not a skip.
 *   2. An embedded PGlite socket server on 127.0.0.1 (default). PGlite runs in
 *      this process, which is what makes the postgres half runnable in CI with
 *      no external service.
 *   3. A loud skip when BUNWA_TEST_EMBEDDED_PGLITE=0 disables the embedded
 *      server and no URL is set. The run output prints SKIPPED and the skipped
 *      test names the reason, so it cannot be mistaken for a pass.
 *
 * Caveat: an externally managed PGlite socket server (a separate process) is
 * not recommended for this suite. The pglite-socket protocol layer desyncs
 * after a query that fails, for example the UNIQUE violations these tests
 * assert on, and the next query can then return wrong results. The in-process
 * server used here does not show that failure. Use a real PostgreSQL or Docker
 * for the BUNWA_TEST_POSTGRES_URL path.
 */

const externalUrl = process.env.BUNWA_TEST_POSTGRES_URL;
let embedded: EmbeddedPostgres | null = null;
let skipReason: string | undefined;

if (!externalUrl) {
  if (process.env.BUNWA_TEST_EMBEDDED_PGLITE === '0' || process.env.BUNWA_TEST_EMBEDDED_PGLITE === 'false') {
    skipReason =
      'BUNWA_TEST_EMBEDDED_PGLITE is disabled and BUNWA_TEST_POSTGRES_URL is not set, ' +
      'so no postgres server was available';
  } else {
    try {
      embedded = await startEmbeddedPostgres();
    } catch (error) {
      skipReason = `embedded PGlite failed to start (${(error as Error).message}); ` +
        'set BUNWA_TEST_POSTGRES_URL to a reachable PostgreSQL to run this half';
    }
  }
}

const resolvedUrl = externalUrl ?? embedded?.url;

runDriverConformance(
  {
    name: 'postgres',
    async setup() {
      const dir = mkdtempSync(join(tmpdir(), 'bunwa-conformance-postgres-'));
      const storage = new PostgresStorage(resolvedUrl!);
      await storage.init();

      const templates = new PostgresTemplateRepository(resolvedUrl!);
      await templates.init();

      return {
        storage,
        templates,
        localDir: dir,
        async dispose() {
          await storage.close();
          await templates.close();
          rmSync(dir, { recursive: true, force: true });
          if (embedded) {
            await embedded.stop();
            embedded = null;
          }
        },
      };
    },
  },
  skipReason,
);

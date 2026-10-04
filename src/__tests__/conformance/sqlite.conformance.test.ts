import 'reflect-metadata';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Sqlite3Storage } from '../../core/engines/noweb/store/sqlite3/Sqlite3Storage';
import { Sqlite3TemplateRepository } from '../../core/templates/sqlite3/Sqlite3TemplateRepository';
import { runDriverConformance } from './conformance.shared';

/**
 * SQLite half of the shared driver conformance suite. Always runs, uses temp
 * files only, and never touches the project's ./data or .sessions directories.
 */
const dir = mkdtempSync(join(tmpdir(), 'bunwa-conformance-sqlite-'));

runDriverConformance({
  name: 'sqlite',
  async setup() {
    const storage = new Sqlite3Storage(join(dir, 'store.sqlite3'));
    await storage.init();

    const templateDb = new Database(join(dir, 'templates.db'));
    const templates = new Sqlite3TemplateRepository(templateDb);
    await templates.init();

    return {
      storage,
      templates,
      localDir: dir,
      async dispose() {
        await storage.close();
        templateDb.close();
        rmSync(dir, { recursive: true, force: true });
      },
    };
  },
});

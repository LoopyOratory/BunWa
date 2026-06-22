import type { Label } from '@whiskeysockets/baileys/lib/Types/Label';
import { ILabelsRepository } from '../ILabelsRepository';
import { NowebLabelsSchema } from '../schemas';
import { Database } from 'bun:sqlite';

import { NOWEBBunSqliteKVRepository } from './NOWEBBunSqliteKVRepository';

export class Sqlite3LabelsRepository
  extends NOWEBBunSqliteKVRepository<Label>
  implements ILabelsRepository
{
  get schema() {
    return NowebLabelsSchema;
  }

  constructor(db: Database) {
    super(db);
  }
}

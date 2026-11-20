import type { Label } from '@whiskeysockets/baileys/lib/Types/Label';
import { ILabelsRepository } from '../ILabelsRepository';
import { BunwebLabelsSchema } from '../schemas';
import { Database } from 'bun:sqlite';

import { BunwebSqlite3KVRepository } from './BunwebSqlite3KVRepository';

export class Sqlite3LabelsRepository
  extends BunwebSqlite3KVRepository<Label>
  implements ILabelsRepository
{
  get schema() {
    return BunwebLabelsSchema;
  }

  constructor(db: Database) {
    super(db);
  }
}

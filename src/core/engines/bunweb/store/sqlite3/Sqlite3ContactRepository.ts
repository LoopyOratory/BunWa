import type { Contact } from '@whiskeysockets/baileys';
import { BunwebContactSchema } from '../schemas';
import { Database } from 'bun:sqlite';

import { IContactRepository } from '../IContactRepository';
import { BunwebSqlite3KVRepository } from './BunwebSqlite3KVRepository';

export class Sqlite3ContactRepository
  extends BunwebSqlite3KVRepository<Contact>
  implements IContactRepository
{
  get schema() {
    return BunwebContactSchema;
  }

  constructor(db: Database) {
    super(db);
  }
}

import type { Contact } from '@whiskeysockets/baileys';
import { NowebContactSchema } from '../schemas';
import { Database } from 'bun:sqlite';

import { IContactRepository } from '../IContactRepository';
import { NOWEBBunSqliteKVRepository } from './NOWEBBunSqliteKVRepository';

export class Sqlite3ContactRepository
  extends NOWEBBunSqliteKVRepository<Contact>
  implements IContactRepository
{
  get schema() {
    return NowebContactSchema;
  }

  constructor(db: Database) {
    super(db);
  }
}

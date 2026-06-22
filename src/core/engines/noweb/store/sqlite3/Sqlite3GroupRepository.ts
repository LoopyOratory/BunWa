import type { GroupMetadata } from '@whiskeysockets/baileys/lib/Types/GroupMetadata';
import { IGroupRepository } from '../IGroupRepository';
import { NowebGroupsSchema } from '../schemas';
import { Database } from 'bun:sqlite';

import { NOWEBBunSqliteKVRepository } from './NOWEBBunSqliteKVRepository';

export class Sqlite3GroupRepository
  extends NOWEBBunSqliteKVRepository<GroupMetadata>
  implements IGroupRepository
{
  get schema() {
    return NowebGroupsSchema;
  }

  constructor(db: Database) {
    super(db);
  }
}

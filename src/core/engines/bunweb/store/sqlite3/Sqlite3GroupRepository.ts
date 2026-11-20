import type { GroupMetadata } from '@whiskeysockets/baileys/lib/Types/GroupMetadata';
import { IGroupRepository } from '../IGroupRepository';
import { BunwebGroupsSchema } from '../schemas';
import { Database } from 'bun:sqlite';

import { BunwebSqlite3KVRepository } from './BunwebSqlite3KVRepository';

export class Sqlite3GroupRepository
  extends BunwebSqlite3KVRepository<GroupMetadata>
  implements IGroupRepository
{
  get schema() {
    return BunwebGroupsSchema;
  }

  constructor(db: Database) {
    super(db);
  }
}

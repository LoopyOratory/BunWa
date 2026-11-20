import { BunwebLidMapSchema } from '../schemas';
import { LimitOffsetParams } from '../../../../../structures/pagination.dto';
import { Database } from 'bun:sqlite';

import { IBunwebLidPNRepository, LidToPN } from '../IBunwebLidPNRepository';
import { BunwebSqlite3KVRepository } from './BunwebSqlite3KVRepository';

export class Sqlite3LidPNRepository
  extends BunwebSqlite3KVRepository<LidToPN>
  implements IBunwebLidPNRepository
{
  get schema() {
    return BunwebLidMapSchema;
  }

  constructor(db: Database) {
    super(db);
  }

  saveLids(lids: LidToPN[]): Promise<void> {
    return this.upsertMany(lids);
  }

  getAllLids(pagination?: LimitOffsetParams): Promise<LidToPN[]> {
    return this.getAll(pagination);
  }

  getLidsCount(): Promise<number> {
    return this.getCount();
  }

  async findLidByPN(pn: string): Promise<string | null> {
    const value = await this.getBy({ pn });
    return value?.id || null;
  }

  async findPNByLid(lid: string): Promise<string | null> {
    const value = await this.getBy({ id: lid });
    return value?.pn || null;
  }
}

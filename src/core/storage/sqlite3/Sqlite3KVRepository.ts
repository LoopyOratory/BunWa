import { SqlKVRepository } from '../sql/SqlKVRepository';
import { Sqlite3JsonQuery } from './Sqlite3JsonQuery';
import { sleep } from '../../../utils/promiseTimeout';
import Knex from 'knex';

export class Sqlite3KVRepository<Entity> extends SqlKVRepository<Entity> {
  protected jsonQuery = new Sqlite3JsonQuery();

  constructor(knex: Knex.Knex) {
    super(knex);
  }

  protected async upsertBatch(entities: Entity[]): Promise<void> {
    await super.upsertBatch(entities);
    if (entities.length >= this.UPSERT_BATCH_SIZE) {
      await sleep(1);
    }
  }
}

import { Field, Schema } from '../Schema';
import { IJsonQuery } from './IJsonQuery';
import { PaginationParams } from '../../../structures/pagination.dto';
import { KnexPaginator } from '../../../utils/Paginator';
import { Knex } from 'knex';
import * as lodash from 'lodash';
import pino from 'pino';

const log = pino({ name: 'SqlKVRepository' });

export type Migration = string;

export class SqlKVRepository<Entity> {
  protected UPSERT_BATCH_SIZE = 100;
  protected Paginator: typeof KnexPaginator = KnexPaginator;

  protected jsonQuery: IJsonQuery;

  get schema(): Schema {
    throw new Error('Not implemented');
  }

  get metadata(): Map<string, (entity: Entity) => any> {
    return new Map();
  }

  get migrations(): Migration[] {
    return [];
  }

  constructor(protected knex: Knex) {}

  get columns(): Field[] {
    return this.schema.columns;
  }

  get table(): string {
    return this.schema.name;
  }

  async init(): Promise<void> {
    await this.applyMigrations();
    await this.validateSchema();
  }

  protected async applyMigrations() {
    for (const migration of this.migrations) {
      await this.knex.raw(migration);
    }
  }

  protected async validateSchema() {
    return;
  }

  save(entity: Entity) {
    return this.upsertOne(entity);
  }

  async upsertOne(entity: Entity): Promise<void> {
    await this.upsertMany([entity]);
  }

  async upsertMany(entities: Entity[]): Promise<void> {
    if (entities.length === 0) {
      return;
    }
    const batchSize = this.UPSERT_BATCH_SIZE;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      await this.upsertBatch(batch);
    }
  }

  protected async upsertBatch(entities: Entity[]): Promise<void> {
    const all = entities.map((entity) => this.dump(entity));
    const data = lodash.uniqBy(all, (d: any) => d.id);
    if (data.length != all.length) {
      log.warn({ all: all.length, unique: data.length }, 'Duplicated entities for upsert batch');
    }
    const columns = this.columns.map((c) => `"${c.fieldName}"`);
    const values = data.map((d) => Object.values(d)).flat();
    const sql = `INSERT INTO "${this.table}" (${columns.join(', ')})
                 VALUES ${data
                   .map(() => `(${columns.map(() => '?').join(', ')})`)
                   .join(', ')} ON CONFLICT(id) DO
    UPDATE
      SET ${columns
        .map((column) => `${column} = excluded.${column}`)
        .join(', ')}`;
    try {
      await this.raw(sql, values);
    } catch (err) {
      log.error({ err, sql }, 'Error upserting data');
      throw err;
    }
  }

  getAll(pagination?: PaginationParams) {
    let query = this.select();
    query = this.pagination(query, pagination);
    return this.all(query);
  }

  async getCount(): Promise<number> {
    const query = this.select().count({ count: 'id' });
    const row = await query.first();
    if (!row) {
      return 0;
    }
    return parseInt(row.count, 10);
  }

  async getAllByIds(ids: string[]) {
    const entitiesMap = await this.getEntitiesByIds(ids);
    return Array.from(entitiesMap.values()).filter(
      (entity) => entity !== null,
    ) as Entity[];
  }

  async getEntitiesByIds(ids: string[]): Promise<Map<string, Entity | null>> {
    if (ids.length === 0) {
      return new Map();
    }

    const rows = await this.select().whereIn('id', ids);
    const entitiesMap = new Map<string, Entity | null>();

    for (const id of ids) {
      entitiesMap.set(id, null);
    }

    for (const row of rows) {
      if (row && row.id) {
        entitiesMap.set(row.id, this.parse(row));
      }
    }

    return entitiesMap;
  }

  getById(id: string): Promise<Entity | null> {
    return this.getBy({ id: id });
  }

  getAllBy(filters: any) {
    const query = this.select().where(filters);
    return this.all(query);
  }

  public async getBy(filters: any) {
    const query = this.select().where(filters).limit(1);
    return this.get(query);
  }

  async deleteAll() {
    const query = this.delete();
    await this.run(query);
  }

  async deleteById(id: string) {
    await this.deleteBy({ id: id });
  }

  public async deleteBy(filters: any) {
    const query = this.delete().where(filters);
    await this.run(query);
  }

  public async raw(sql: string, bindings: any[]): Promise<void> {
    await this.knex.raw(sql, bindings);
  }

  protected async run(query: Knex.QueryBuilder): Promise<void> {
    await query;
  }

  protected async get(query: Knex.QueryBuilder): Promise<Entity | null> {
    const row = await query.first();
    if (!row) {
      return null;
    }
    return this.parse(row);
  }

  public async all(query: Knex.QueryBuilder): Promise<Entity[]> {
    const rows = await query;
    return rows.map((row) => this.parse(row));
  }

  public getKnex(): Knex {
    return this.knex;
  }

  public select() {
    return this.knex.select(`${this.table}.*`).from(this.table);
  }

  protected delete() {
    return this.knex.delete().from(this.table);
  }

  public pagination(query: any, pagination?: PaginationParams) {
    const paginator = new this.Paginator(
      pagination,
      this.jsonQuery,
      this.table,
    );
    return paginator.apply(query);
  }

  public filterJson(field: string, key: string, value: any): [string, string] {
    return this.jsonQuery.filter(field, key, value);
  }

  protected stringify(data: any): string {
    return JSON.stringify(data);
  }

  public parse(row: any) {
    return JSON.parse(row.data);
  }

  protected dump(entity: Entity) {
    const data = {};
    const raw = entity;
    for (const field of this.columns) {
      const fn = this.metadata.get(field.fieldName);
      if (fn) {
        data[field.fieldName] = fn(raw);
      } else if (field.fieldName == 'data') {
        data['data'] = this.stringify(raw);
      } else {
        data[field.fieldName] = raw[field.fieldName] ?? null;
      }
    }
    return data;
  }
}

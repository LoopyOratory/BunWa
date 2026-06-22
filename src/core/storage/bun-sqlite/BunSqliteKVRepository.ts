import { Database } from 'bun:sqlite';
import { Field, Schema } from '../Schema';
import { IJsonQuery } from '../sql/IJsonQuery';
import { PaginationParams } from '../../../structures/pagination.dto';
import * as lodash from 'lodash';
import pino from 'pino';

const log = pino({ name: 'BunSqliteKVRepository' });

export type Migration = string;

/**
 * Base repository using bun:sqlite for high-performance SQLite access.
 * Drop-in replacement for SqlKVRepository (knex-based).
 * bun:sqlite is synchronous, so methods return directly (wrapped in Promise for interface compat).
 */
export class BunSqliteKVRepository<Entity> {
  protected UPSERT_BATCH_SIZE = 100;
  protected jsonQuery: IJsonQuery = {
    filter: (field, key, value) => [`${field} LIKE ?`, `%"${key}":${JSON.stringify(value)}%`],
    sortBy: (field, sortBy, direction) => `json_extract(${field}, '$.${sortBy}') ${direction}`,
  };

  get schema(): Schema {
    throw new Error('Not implemented');
  }

  get metadata(): Map<string, (entity: Entity) => any> {
    return new Map();
  }

  get migrations(): Migration[] {
    return [];
  }

  constructor(protected db: Database) {}

  get columns(): Field[] {
    return this.schema.columns;
  }

  get table(): string {
    return this.schema.name;
  }

  async init(): Promise<void> {
    this.applyMigrations();
    this.validateSchema();
  }

  protected applyMigrations() {
    for (const migration of this.migrations) {
      this.db.run(migration);
    }
  }

  protected validateSchema() {
    // bun:sqlite validates at open time; schema checks optional
  }

  save(entity: Entity) {
    return this.upsertOne(entity);
  }

  async upsertOne(entity: Entity): Promise<void> {
    await this.upsertMany([entity]);
  }

  async upsertMany(entities: Entity[]): Promise<void> {
    if (entities.length === 0) return;
    const batchSize = this.UPSERT_BATCH_SIZE;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      this.upsertBatch(batch);
    }
  }

  protected upsertBatch(entities: Entity[]): void {
    const all = entities.map((entity) => this.dump(entity));
    const data = lodash.uniqBy(all, (d: any) => d.id);
    if (data.length !== all.length) {
      log.warn({ all: all.length, unique: data.length }, 'Duplicated entities for upsert batch');
    }

    const columns = this.columns.map((c) => `"${c.fieldName}"`);
    const placeholders = columns.map(() => '?').join(', ');
    const updateSet = columns.map((col) => `${col} = excluded.${col}`).join(', ');
    const sql = `INSERT INTO "${this.table}" (${columns.join(', ')})
                 VALUES ${data.map(() => `(${placeholders})`).join(', ')}
                 ON CONFLICT(id) DO UPDATE SET ${updateSet}`;

    const values = data.map((d) => Object.values(d)).flat();
    try {
      this.db.run(sql, values);
    } catch (err) {
      log.error({ err, sql }, 'Error upserting data');
      throw err;
    }
  }

  getAll(pagination?: PaginationParams): Promise<Entity[]> {
    let sql = `SELECT "${this.table}".* FROM "${this.table}"`;
    const params: any[] = [];

    if (pagination?.limit) {
      sql += ` LIMIT ?`;
      params.push(pagination.limit);
      if (pagination.offset) {
        sql += ` OFFSET ?`;
        params.push(pagination.offset);
      }
    }

    const rows = params.length > 0
      ? this.db.query(sql).all(...params)
      : this.db.query(sql).all();
    return Promise.resolve(rows.map((row) => this.parse(row)));
  }

  async getCount(): Promise<number> {
    const row = this.db.query(`SELECT COUNT(id) as count FROM "${this.table}"`).get() as any;
    return row ? parseInt(row.count, 10) : 0;
  }

  async getAllByIds(ids: string[]): Promise<Entity[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.query(
      `SELECT * FROM "${this.table}" WHERE id IN (${placeholders})`
    ).all(...ids);
    return rows.map((row) => this.parse(row));
  }

  async getEntitiesByIds(ids: string[]): Promise<Map<string, Entity | null>> {
    if (ids.length === 0) return new Map();
    const entitiesMap = new Map<string, Entity | null>();
    for (const id of ids) entitiesMap.set(id, null);

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.query(
      `SELECT * FROM "${this.table}" WHERE id IN (${placeholders})`
    ).all(...ids);

    for (const row of rows) {
      if (row && (row as any).id) {
        entitiesMap.set((row as any).id, this.parse(row));
      }
    }
    return entitiesMap;
  }

  getById(id: string): Promise<Entity | null> {
    return this.getBy({ id });
  }

  async getAllBy(filters: any): Promise<Entity[]> {
    const { sql, params } = this.buildWhere(filters);
    const rows = this.db.query(
      `SELECT * FROM "${this.table}" ${sql}`
    ).all(...params);
    return rows.map((row) => this.parse(row));
  }

  public async getBy(filters: any): Promise<Entity | null> {
    const { sql, params } = this.buildWhere(filters);
    const row = this.db.query(
      `SELECT * FROM "${this.table}" ${sql} LIMIT 1`
    ).get(...params);
    return row ? this.parse(row) : null;
  }

  async deleteAll() {
    this.db.run(`DELETE FROM "${this.table}"`);
  }

  async deleteById(id: string) {
    this.db.run(`DELETE FROM "${this.table}" WHERE id = ?`, [id]);
  }

  public async deleteBy(filters: any) {
    const { sql, params } = this.buildWhere(filters);
    this.db.run(`DELETE FROM "${this.table}" ${sql}`, params);
  }

  public async raw(sql: string, bindings: any[]): Promise<void> {
    this.db.run(sql, bindings);
  }

  /** Execute raw SQL and return rows */
  public rawAll(sql: string, bindings: any[] = []): any[] {
    return this.db.query(sql).all(...bindings);
  }

  /** Execute raw SQL and return first row */
  public rawGet(sql: string, bindings: any[] = []): any {
    return this.db.query(sql).get(...bindings);
  }

  /** Get the underlying bun:sqlite Database */
  public getDb(): Database {
    return this.db;
  }

  public select() {
    // Returns a query builder-like object for compatibility
    return new BunSqliteQueryBuilder(this);
  }

  public pagination(query: BunSqliteQueryBuilder, pagination?: PaginationParams) {
    if (pagination?.limit) {
      query.limit(pagination.limit);
      if (pagination.offset) {
        query.offset(pagination.offset);
      }
    }
    return query;
  }

  public filterJson(field: string, key: string, value: any): [string, string] {
    if (this.jsonQuery) {
      return this.jsonQuery.filter(field, key, value);
    }
    // Default JSON filter for SQLite
    return [`${field} LIKE ?`, `%"${key}":${JSON.stringify(value)}%`];
  }

  protected stringify(data: any): string {
    return JSON.stringify(data);
  }

  public parse(row: any) {
    return JSON.parse(row.data);
  }

  protected dump(entity: Entity) {
    const data: Record<string, any> = {};
    const raw = entity as any;
    for (const field of this.columns) {
      const fn = this.metadata.get(field.fieldName);
      if (fn) {
        data[field.fieldName] = fn(raw);
      } else if (field.fieldName === 'data') {
        data['data'] = this.stringify(raw);
      } else {
        data[field.fieldName] = raw[field.fieldName] ?? null;
      }
    }
    return data;
  }

  private buildWhere(filters: any): { sql: string; params: any[] } {
    const keys = Object.keys(filters);
    if (keys.length === 0) return { sql: '', params: [] };
    const conditions = keys.map((key) => `"${key}" = ?`);
    const params = keys.map((key) => filters[key]);
    return { sql: `WHERE ${conditions.join(' AND ')}`, params };
  }
}

/**
 * Lightweight query builder for compatibility with existing code.
 * Replaces Knex.QueryBuilder patterns.
 */
export class BunSqliteQueryBuilder {
  private _table: string;
  private _conditions: string[] = [];
  private _params: any[] = [];
  private _limitVal?: number;
  private _offsetVal?: number;
  private _orderBy?: string;
  private _orderDir: 'ASC' | 'DESC' = 'ASC';
  private _selectCols: string[] = ['*'];
  private _joins: string[] = [];
  private _rawSql?: string;

  constructor(private repo: BunSqliteKVRepository<any>) {
    this._table = repo.table;
  }

  select(...cols: string[]): this {
    this._selectCols = cols.length ? cols : ['*'];
    return this;
  }

  where(col: string, op: string, value?: any): this {
    if (value === undefined) {
      // where(col, value) — equality
      this._conditions.push(`"${col}" = ?`);
      this._params.push(op);
    } else {
      this._conditions.push(`"${col}" ${op} ?`);
      this._params.push(value);
    }
    return this;
  }

  whereNotNull(col: string): this {
    this._conditions.push(`"${col}" IS NOT NULL`);
    return this;
  }

  whereIn(col: string, values: any[]): this {
    if (values.length === 0) {
      this._conditions.push('1 = 0');
    } else {
      const placeholders = values.map(() => '?').join(', ');
      this._conditions.push(`"${col}" IN (${placeholders})`);
      this._params.push(...values);
    }
    return this;
  }

  whereRaw(sql: string, params: any[] = []): this {
    this._conditions.push(sql);
    this._params.push(...params);
    return this;
  }

  andWhere(col: string, op: string, value: any): this {
    return this.where(col, op, value);
  }

  andWhereNot(col: string, op: string, value: any): this {
    this._conditions.push(`NOT ("${col}" ${op} ?)`);
    this._params.push(value);
    return this;
  }

  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  offset(n: number): this {
    this._offsetVal = n;
    return this;
  }

  orderBy(col: string, dir: 'ASC' | 'DESC' = 'ASC'): this {
    this._orderBy = `"${col}" ${dir}`;
    return this;
  }

  join(table: string, on: string): this {
    this._joins.push(`JOIN ${table} ON ${on}`);
    return this;
  }

  leftJoin(table: string, on: string): this {
    this._joins.push(`LEFT JOIN ${table} ON ${on}`);
    return this;
  }

  first(): Promise<any> {
    this._limitVal = 1;
    const rows = this.exec();
    return Promise.resolve(rows[0] || null);
  }

  exec(): any[] {
    if (this._rawSql) {
      return this.repo.rawAll(this._rawSql, this._params);
    }
    const cols = this._selectCols.join(', ');
    let sql = `SELECT ${cols} FROM "${this._table}"`;
    if (this._joins.length) sql += ' ' + this._joins.join(' ');
    if (this._conditions.length) sql += ' WHERE ' + this._conditions.join(' AND ');
    if (this._orderBy) sql += ` ORDER BY ${this._orderBy}`;
    if (this._limitVal != null) sql += ` LIMIT ${this._limitVal}`;
    if (this._offsetVal != null) sql += ` OFFSET ${this._offsetVal}`;
    return this.repo.rawAll(sql, this._params);
  }
}

import { NowebMessagesMetadata } from '../metadata';
import { NowebMessagesSchema } from '../schemas';
import { GetChatMessagesFilter } from '../../../../../structures/chats.dto';
import { PaginationParams } from '../../../../../structures/pagination.dto';
import { Database } from 'bun:sqlite';

import { IMessagesRepository } from '../IMessagesRepository';
import { NOWEBBunSqliteKVRepository } from './NOWEBBunSqliteKVRepository';
import { INowebLidPNRepository } from '../INowebLidPNRepository';

export class Sqlite3MessagesRepository
  extends NOWEBBunSqliteKVRepository<any>
  implements IMessagesRepository
{
  constructor(
    db: Database,
    private readonly lidRepository: INowebLidPNRepository,
  ) {
    super(db);
  }

  get schema() {
    return NowebMessagesSchema;
  }

  get metadata() {
    return NowebMessagesMetadata;
  }

  async upsert(messages: any[]): Promise<void> {
    return this.upsertMany(messages);
  }

  async getAllByJid(
    jid: string,
    filter: GetChatMessagesFilter,
    pagination: PaginationParams,
    merge?: boolean,
  ): Promise<any[]> {
    let sql = `SELECT "${this.table}".* FROM "${this.table}"`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (jid !== '*') {
      if (merge) {
        // Resolve LID to PN if needed
        const pnJid = await this.resolvePnJid(jid);
        conditions.push(`("${this.table}".jid = ? OR "${this.table}".jid IN (SELECT id FROM lid_map WHERE pn = ?))`);
        params.push(pnJid, pnJid);
      } else {
        conditions.push(`"${this.table}".jid = ?`);
        params.push(jid);
      }
    }

    const f = filter as any;
    if (f['filter.timestamp.lte'] != null) {
      conditions.push(`"${this.table}"."messageTimestamp" <= ?`);
      params.push(f['filter.timestamp.lte']);
    }
    if (f['filter.timestamp.gte'] != null) {
      conditions.push(`"${this.table}"."messageTimestamp" >= ?`);
      params.push(f['filter.timestamp.gte']);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY "${this.table}"."messageTimestamp" DESC`;

    if (pagination?.limit) {
      sql += ` LIMIT ?`;
      params.push(pagination.limit);
      if (pagination.offset) {
        sql += ` OFFSET ?`;
        params.push(pagination.offset);
      }
    }

    const rows = this.db.query(sql).all(...params);
    return rows.map((row) => this.parse(row));
  }

  async getByJidById(jid: string, id: string, merge?: boolean): Promise<any> {
    if (jid === '*') {
      return this.getBy({ id });
    }

    const pnJid = merge ? await this.resolvePnJid(jid) : jid;

    let sql: string;
    let params: any[];

    if (merge) {
      sql = `SELECT * FROM "${this.table}" WHERE id = ? AND (jid = ? OR jid IN (SELECT id FROM lid_map WHERE pn = ?)) LIMIT 1`;
      params = [id, pnJid, pnJid];
    } else {
      sql = `SELECT * FROM "${this.table}" WHERE id = ? AND jid = ? LIMIT 1`;
      params = [id, jid];
    }

    const row = this.db.query(sql).get(...params);
    return row ? this.parse(row) : null;
  }

  async updateByJidAndId(jid: string, id: string, update: any): Promise<boolean> {
    const entity = await this.getByJidById(jid, id);
    if (!entity) return false;
    Object.assign(entity, update);
    await this.upsertOne(entity);
    return true;
  }

  async deleteByJidByIds(jid: string, ids: string[]): Promise<void> {
    const placeholders = ids.map(() => '?').join(', ');
    this.db.run(
      `DELETE FROM "${this.table}" WHERE jid = ? AND id IN (${placeholders})`,
      [jid, ...ids]
    );
  }

  async deleteAllByJid(jid: string): Promise<void> {
    this.db.run(`DELETE FROM "${this.table}" WHERE jid = ?`, [jid]);
  }

  async getNewestPerJid(jids: string[]): Promise<Map<string, any>> {
    if (jids.length === 0) return new Map();
    const placeholders = jids.map(() => '?').join(', ');
    const sql = `
      SELECT ranked.* FROM (
        SELECT *,
               ROW_NUMBER() OVER (PARTITION BY jid ORDER BY messageTimestamp DESC) AS rn
        FROM "${this.table}"
        WHERE jid IN (${placeholders})
      ) ranked
      WHERE ranked.rn = 1
    `;
    const rows = this.db.query(sql).all(...jids);
    const map = new Map<string, any>();
    for (const row of rows) {
      map.set(row.jid, this.parse(row));
    }
    return map;
  }

  private async resolvePnJid(jid: string): Promise<string> {
    if (!jid.endsWith('@lid')) return jid;
    if (this.lidRepository) {
      const mapped = await this.lidRepository.findPNByLid(jid);
      if (mapped) return mapped;
    }
    const row = this.db.query('SELECT pn FROM lid_map WHERE id = ?').get(jid) as any;
    return row?.pn || jid;
  }
}

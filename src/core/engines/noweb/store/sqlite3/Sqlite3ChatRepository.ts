import type { Chat } from '@whiskeysockets/baileys';
import { NowebChatSchema } from '../schemas';
import { OverviewFilter } from '../../../../../structures/chats.dto';
import { PaginationParams } from '../../../../../structures/pagination.dto';
import { Database } from 'bun:sqlite';

import { IChatRepository } from '../IChatRepository';
import { NOWEBBunSqliteKVRepository } from './NOWEBBunSqliteKVRepository';

export class Sqlite3ChatRepository
  extends NOWEBBunSqliteKVRepository<Chat>
  implements IChatRepository
{
  get schema() {
    return NowebChatSchema;
  }

  constructor(db: Database) {
    super(db);
  }

  async getAllWithMessages(
    pagination: PaginationParams,
    broadcast: boolean,
    filter?: OverviewFilter,
    _merge?: boolean,
  ): Promise<Chat[]> {
    // Simplified implementation using bun:sqlite directly
    let sql = `SELECT "${this.table}".* FROM "${this.table}" WHERE "${this.table}"."conversationTimestamp" IS NOT NULL`;
    const params: any[] = [];

    if (!broadcast) {
      sql += ` AND "${this.table}".id NOT LIKE '%@broadcast' AND "${this.table}".id NOT LIKE '%@newsletter'`;
    }

    const f = filter as any;
    if (f?.ids && f.ids.length > 0) {
      const placeholders = f.ids.map(() => '?').join(', ');
      sql += ` AND "${this.table}".id IN (${placeholders})`;
      params.push(...f.ids);
    }

    sql += ` ORDER BY "${this.table}"."conversationTimestamp" DESC`;

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
}

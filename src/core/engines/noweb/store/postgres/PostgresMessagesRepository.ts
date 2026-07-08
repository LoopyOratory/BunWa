import { proto } from '@whiskeysockets/baileys';
import { PaginationParams } from '../../../../structures/pagination.dto';
import { IMessagesRepository } from '../IMessagesRepository';
import { INowebLidPNRepository } from '../INowebLidPNRepository';
import Knex from 'knex';

export class PostgresMessagesRepository implements IMessagesRepository {
  constructor(
    private readonly knex: Knex.Knex,
    private readonly lidRepository: INowebLidPNRepository,
  ) {}

  async getAll(jid: string, pagination: PaginationParams): Promise<proto.IWebMessageInfo[]> {
    let query = this.knex('messages')
      .where({ jid })
      .select('data')
      .orderBy('messageTimestamp', 'desc');
    
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
    }
    
    const rows = await query;
    return rows.map((row) => JSON.parse(row.data));
  }

  async getById(jid: string, id: string): Promise<proto.IWebMessageInfo | null> {
    const row = await this.knex('messages').where({ jid, id }).first();
    return row ? JSON.parse(row.data) : null;
  }

  async deleteAll(jid: string): Promise<void> {
    await this.knex('messages').where({ jid }).del();
  }

  async deleteById(jid: string, id: string): Promise<void> {
    await this.knex('messages').where({ jid, id }).del();
  }

  async save(message: proto.IWebMessageInfo, jid: string): Promise<void> {
    const id = message.key?.id;
    const timestamp = message.messageTimestamp;
    
    if (!id || !timestamp) return;

    await this.knex('messages')
      .insert({
        jid,
        id,
        messageTimestamp: typeof timestamp === 'number' ? timestamp : parseInt(timestamp as string),
        data: JSON.stringify(message),
      })
      .onConflict(['jid', 'id'])
      .merge();
  }

  async upsertMany(messages: proto.IWebMessageInfo[], jid: string): Promise<void> {
    if (messages.length === 0) return;

    const rows = messages
      .filter((m) => m.key?.id && m.messageTimestamp)
      .map((m) => ({
        jid,
        id: m.key!.id!,
        messageTimestamp: typeof m.messageTimestamp === 'number' 
          ? m.messageTimestamp 
          : parseInt(m.messageTimestamp as string),
        data: JSON.stringify(m),
      }));

    if (rows.length === 0) return;

    await this.knex('messages')
      .insert(rows)
      .onConflict(['jid', 'id'])
      .merge();
  }

  async getCount(jid: string): Promise<number> {
    const result = await this.knex('messages').where({ jid }).count('id as count').first();
    return parseInt(result?.count as string) || 0;
  }

  async getNewestPerJid(jids: string[]): Promise<Map<string, any>> {
    if (jids.length === 0) return new Map();
    const rows = await this.knex('messages')
      .select('*')
      .whereIn('jid', jids)
      .orderBy('messageTimestamp', 'desc')
      .then((allRows) => {
        // Manual dedup per JID since Knex doesn't have a clean ROW_NUMBER API
        const seen = new Set<string>();
        return allRows.filter((row) => {
          if (seen.has(row.jid)) return false;
          seen.add(row.jid);
          return true;
        });
      });
    const map = new Map<string, any>();
    for (const row of rows) {
      map.set(row.jid, row.data ? JSON.parse(row.data) : row);
    }
    return map;
  }
}

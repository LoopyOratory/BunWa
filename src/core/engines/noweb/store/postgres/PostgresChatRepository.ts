import { Chat } from '@whiskeysockets/baileys';
import { PaginationParams } from '../../../../../structures/pagination.dto';
import { OverviewFilter } from '../../../../../structures/chats.dto';
import { IChatRepository } from '../IChatRepository';
import Knex from 'knex';

export class PostgresChatRepository implements IChatRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async getAll(): Promise<Chat[]> {
    const rows = await this.knex('chats').select('data');
    return rows.map((row) => JSON.parse(row.data));
  }

  async getAllByIds(ids: string[]): Promise<Chat[]> {
    if (ids.length === 0) return [];
    const rows = await this.knex('chats').whereIn('id', ids).select('data');
    return rows.map((row) => JSON.parse(row.data));
  }

  async getAllWithMessages(
    pagination: PaginationParams,
    broadcast: boolean,
    filter?: OverviewFilter,
    merge?: boolean,
  ): Promise<Chat[]> {
    let query = this.knex('chats').select('data');
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
    }
    const rows = await query;
    return rows.map((row) => JSON.parse(row.data));
  }

  async getById(id: string): Promise<Chat | null> {
    const row = await this.knex('chats').where({ id }).first();
    return row ? JSON.parse(row.data) : null;
  }

  async deleteAll(): Promise<void> {
    await this.knex('chats').del();
  }

  async deleteById(id: string): Promise<void> {
    await this.knex('chats').where({ id }).del();
  }

  async save(chat: Chat): Promise<void> {
    await this.knex('chats')
      .insert({
        id: chat.id,
        conversationTimestamp: chat.conversationTimestamp,
        data: JSON.stringify(chat),
      })
      .onConflict('id')
      .merge();
  }

  async upsertMany(chats: Chat[]): Promise<void> {
    if (chats.length === 0) return;

    const rows = chats.map((c) => ({
      id: c.id,
      conversationTimestamp: c.conversationTimestamp,
      data: JSON.stringify(c),
    }));

    await this.knex('chats')
      .insert(rows)
      .onConflict('id')
      .merge();
  }
}

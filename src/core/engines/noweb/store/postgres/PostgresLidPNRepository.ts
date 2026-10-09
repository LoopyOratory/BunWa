import { PaginationParams, LimitOffsetParams } from '../../../../../structures/pagination.dto';
import { INowebLidPNRepository, LidToPN } from '../INowebLidPNRepository';
import Knex from 'knex';

export class PostgresLidPNRepository implements INowebLidPNRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async getAll(pagination?: PaginationParams): Promise<any[]> {
    let query = this.knex('lid_map').select('*');
    // A caller that passes a pagination object without a limit means "all of
    // them", the way the SQLite path behaves. Defaulting to 50 here silently
    // truncated every unpaginated read on Postgres — contacts, chats, groups,
    // labels, LID mappings and messages — while SQLite returned the full set.
    if (pagination?.limit) {
      query = query.limit(pagination.limit);
      if (pagination.offset) {
        query = query.offset(pagination.offset);
      }
    }
    return query;
  }

  async getCount(): Promise<number> {
    const result = await this.knex('lid_map').count('id as count').first();
    return parseInt(result?.count as string) || 0;
  }

  async findByLid(lid: string): Promise<string | null> {
    const row = await this.knex('lid_map').where({ id: lid }).first();
    return row?.pn || null;
  }

  async findByPn(pn: string): Promise<string | null> {
    const row = await this.knex('lid_map').where({ pn }).first();
    return row?.id || null;
  }

  async save(lid: string, pn: string, data?: any): Promise<void> {
    await this.knex('lid_map')
      .insert({ id: lid, pn, data: data ? JSON.stringify(data) : null })
      .onConflict('id')
      .merge();
  }

  async deleteAll(): Promise<void> {
    await this.knex('lid_map').del();
  }

  async deleteById(id: string): Promise<void> {
    await this.knex('lid_map').where({ id }).del();
  }

  async saveLids(lids: LidToPN[]): Promise<void> {
    for (const { id, pn } of lids) {
      await this.save(id, pn);
    }
  }

  async getAllLids(pagination?: LimitOffsetParams): Promise<LidToPN[]> {
    return this.getAll(pagination);
  }

  async getLidsCount(): Promise<number> {
    return this.getCount();
  }

  async findPNByLid(lid: string): Promise<string | null> {
    return this.findByLid(lid);
  }

  async findLidByPN(pn: string): Promise<string | null> {
    return this.findByPn(pn);
  }
}

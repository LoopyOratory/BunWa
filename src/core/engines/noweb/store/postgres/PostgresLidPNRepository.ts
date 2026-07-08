import { PaginationParams } from '../../../../../structures/pagination.dto';
import { INowebLidPNRepository } from '../INowebLidPNRepository';
import Knex from 'knex';

export class PostgresLidPNRepository implements INowebLidPNRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async getAll(pagination?: PaginationParams): Promise<any[]> {
    let query = this.knex('lid_map').select('*');
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
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
}

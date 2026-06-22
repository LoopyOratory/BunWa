import { GroupMetadata } from '@whiskeysockets/baileys/lib/Types/GroupMetadata';
import { PaginationParams } from '../../../../structures/pagination.dto';
import { IGroupRepository } from '../IGroupRepository';
import Knex from 'knex';

export class PostgresGroupRepository implements IGroupRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async getAll(pagination: PaginationParams): Promise<GroupMetadata[]> {
    let query = this.knex('groups').select('data');
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
    }
    const rows = await query;
    return rows.map((row) => JSON.parse(row.data));
  }

  async getById(id: string): Promise<GroupMetadata | null> {
    const row = await this.knex('groups').where({ id }).first();
    return row ? JSON.parse(row.data) : null;
  }

  async deleteAll(): Promise<void> {
    await this.knex('groups').del();
  }

  async deleteById(id: string): Promise<void> {
    await this.knex('groups').where({ id }).del();
  }

  async save(group: GroupMetadata): Promise<void> {
    await this.knex('groups')
      .insert({ id: group.id, data: JSON.stringify(group) })
      .onConflict('id')
      .merge();
  }

  async upsertMany(groups: GroupMetadata[]): Promise<void> {
    if (groups.length === 0) return;

    const rows = groups.map((g) => ({
      id: g.id,
      data: JSON.stringify(g),
    }));

    await this.knex('groups')
      .insert(rows)
      .onConflict('id')
      .merge();
  }
}

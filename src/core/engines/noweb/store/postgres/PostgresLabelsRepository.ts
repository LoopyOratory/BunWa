import { Label } from '@whiskeysockets/baileys/lib/Types/Label';
import { PaginationParams } from '../../../../structures/pagination.dto';
import { ILabelsRepository } from '../ILabelsRepository';
import Knex from 'knex';

export class PostgresLabelsRepository implements ILabelsRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async getAll(pagination?: PaginationParams): Promise<Label[]> {
    let query = this.knex('labels').select('data');
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
    }
    const rows = await query;
    return rows.map((row) => JSON.parse(row.data));
  }

  async getById(id: string): Promise<Label | null> {
    const row = await this.knex('labels').where({ id }).first();
    return row ? JSON.parse(row.data) : null;
  }

  async deleteAll(): Promise<void> {
    await this.knex('labels').del();
  }

  async deleteById(id: string): Promise<void> {
    await this.knex('labels').where({ id }).del();
  }

  async save(label: Label): Promise<void> {
    await this.knex('labels')
      .insert({ id: label.id, data: JSON.stringify(label) })
      .onConflict('id')
      .merge();
  }

  async upsertMany(labels: Label[]): Promise<void> {
    if (labels.length === 0) return;

    const rows = labels.map((l) => ({
      id: l.id,
      data: JSON.stringify(l),
    }));

    await this.knex('labels')
      .insert(rows)
      .onConflict('id')
      .merge();
  }
}

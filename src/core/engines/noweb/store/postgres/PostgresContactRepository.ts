import { Contact } from '@whiskeysockets/baileys';
import { PaginationParams } from '../../../../structures/pagination.dto';
import { IContactRepository } from '../IContactRepository';
import Knex from 'knex';

export class PostgresContactRepository implements IContactRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async getAll(pagination?: PaginationParams): Promise<Contact[]> {
    let query = this.knex('contacts').select('data');
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
    }
    const rows = await query;
    return rows.map((row) => JSON.parse(row.data));
  }

  async getById(id: string): Promise<Contact | null> {
    const row = await this.knex('contacts').where({ id }).first();
    return row ? JSON.parse(row.data) : null;
  }

  async getEntitiesByIds(ids: string[]): Promise<Map<string, Contact | null>> {
    const result = new Map<string, Contact | null>();
    if (ids.length === 0) return result;

    const rows = await this.knex('contacts').whereIn('id', ids);
    const contactMap = new Map(rows.map((row) => [row.id, JSON.parse(row.data)]));

    for (const id of ids) {
      result.set(id, contactMap.get(id) || null);
    }
    return result;
  }

  async deleteAll(): Promise<void> {
    await this.knex('contacts').del();
  }

  async deleteById(id: string): Promise<void> {
    await this.knex('contacts').where({ id }).del();
  }

  async save(contact: Contact): Promise<void> {
    await this.knex('contacts')
      .insert({ id: contact.id, data: JSON.stringify(contact) })
      .onConflict('id')
      .merge();
  }

  async upsertMany(contacts: Contact[]): Promise<void> {
    if (contacts.length === 0) return;

    const rows = contacts.map((c) => ({
      id: c.id,
      data: JSON.stringify(c),
    }));

    await this.knex('contacts')
      .insert(rows)
      .onConflict('id')
      .merge();
  }
}

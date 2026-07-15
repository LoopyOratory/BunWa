import { proto } from '@whiskeysockets/baileys';
import { GetChatMessagesFilter } from '../../../../../structures/chats.dto';
import { PaginationParams } from '../../../../../structures/pagination.dto';
import { AckToStatus } from '../../../../utils/acks';
import { isLidUser } from '../../../../utils/jids';
import { IMessagesRepository } from '../IMessagesRepository';
import { INowebLidPNRepository } from '../INowebLidPNRepository';
import { ALL_JID } from '../../session.noweb.core';
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

  async getById(id: string): Promise<proto.IWebMessageInfo | null> {
    const row = await this.knex('messages').where({ id }).first();
    return row ? JSON.parse(row.data) : null;
  }

  async deleteAll(): Promise<void> {
    await this.knex('messages').del();
  }

  async deleteById(jid: string, id: string): Promise<void> {
    await this.knex('messages').where({ jid, id }).del();
  }

  private async resolvePnJid(jid: string): Promise<string> {
    if (!isLidUser(jid)) {
      return jid;
    }
    const mapped = await this.lidRepository.findPNByLid(jid);
    return mapped || jid;
  }

  private applyPnJidFilter(query: any, pnJid: string): any {
    return query.where((builder: any) => {
      builder
        .where('messages.jid', pnJid)
        .orWhereIn(
          'messages.jid',
          this.knex.select('id').from('lid_map').where('pn', pnJid),
        );
    });
  }

  async upsert(messages: proto.IWebMessageInfo[]): Promise<void> {
    const byJid = new Map<string, proto.IWebMessageInfo[]>();
    for (const message of messages) {
      const jid = message.key?.remoteJid;
      if (!jid) continue;
      const list = byJid.get(jid) || [];
      list.push(message);
      byJid.set(jid, list);
    }
    for (const [jid, jidMessages] of byJid) {
      await this.upsertMany(jidMessages, jid);
    }
  }

  async upsertOne(message: proto.IWebMessageInfo): Promise<void> {
    const jid = message.key?.remoteJid;
    if (!jid) return;
    await this.save(message, jid);
  }

  async getAllByJid(
    jid: string,
    filter: GetChatMessagesFilter,
    pagination: PaginationParams,
    merge = true,
  ): Promise<any[]> {
    let query: any = this.knex('messages').select('data');
    if (jid !== ALL_JID) {
      if (merge) {
        const pnJid = await this.resolvePnJid(jid);
        query = this.applyPnJidFilter(query, pnJid);
      } else {
        query = query.where('messages.jid', jid);
      }
    }
    if (filter['filter.timestamp.lte'] != null) {
      query = query.where('messageTimestamp', '<=', filter['filter.timestamp.lte']);
    }
    if (filter['filter.timestamp.gte'] != null) {
      query = query.where('messageTimestamp', '>=', filter['filter.timestamp.gte']);
    }
    query = query.orderBy('messageTimestamp', 'desc');
    if (pagination) {
      query = query.limit(pagination.limit || 50).offset(pagination.offset || 0);
    }
    const rows = await query;
    let results = rows.map((row: any) => JSON.parse(row.data));
    // fromMe/ack filters operate on the parsed JSON payload (no native jsonb
    // columns on this table yet), so they're applied in-memory post-query.
    if (filter['filter.fromMe'] != null) {
      results = results.filter(
        (m: any) => Boolean(m.key?.fromMe) === filter['filter.fromMe'],
      );
    }
    if (filter['filter.ack'] != null) {
      const status = AckToStatus(filter['filter.ack']);
      results = results.filter((m: any) => m.status === status);
    }
    return results;
  }

  async getByJidById(jid: string, id: string, merge = true): Promise<any> {
    if (jid === ALL_JID) {
      return this.getById(id);
    }
    let query: any = this.knex('messages').where('messages.id', id);
    if (merge) {
      const pnJid = await this.resolvePnJid(jid);
      query = this.applyPnJidFilter(query, pnJid);
    } else {
      query = query.andWhere('messages.jid', jid);
    }
    const row = await query.first();
    return row ? JSON.parse(row.data) : null;
  }

  async updateByJidAndId(jid: string, id: string, update: any): Promise<boolean> {
    const entity = await this.getByJidById(jid, id);
    if (!entity) {
      return false;
    }
    Object.assign(entity, update);
    await this.save(entity, jid);
    return true;
  }

  async deleteByJidByIds(jid: string, ids: string[]): Promise<void> {
    await this.knex('messages').where({ jid }).whereIn('id', ids).del();
  }

  async deleteAllByJid(jid: string): Promise<void> {
    await this.knex('messages').where({ jid }).del();
  }

  async save(message: proto.IWebMessageInfo, jid: string): Promise<void> {
    const id = message.key?.id;
    const timestamp = message.messageTimestamp;
    
    if (!id || !timestamp) return;

    await this.knex('messages')
      .insert({
        jid,
        id,
        messageTimestamp: typeof timestamp === 'number' ? timestamp : parseInt(String(timestamp)),
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
          : parseInt(String(m.messageTimestamp)),
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

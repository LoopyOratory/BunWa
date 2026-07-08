import { GetChatMessagesFilter } from '../../../../structures/chats.dto';
import { PaginationParams } from '../../../../structures/pagination.dto';

export interface IMessagesRepository {
  deleteAll(): Promise<void>;

  upsert(messages: any[]): Promise<void>;

  upsertOne(message: any): Promise<void>;

  getById(id: string): Promise<any | null>;

  getAllByJid(
    jid: string,
    filter: GetChatMessagesFilter,
    pagination: PaginationParams,
    merge?: boolean,
  ): Promise<any[]>;

  getByJidById(jid: string, id: string, merge?: boolean): Promise<any | null>;

  updateByJidAndId(jid: string, id: string, update: any): Promise<boolean>;

  deleteByJidByIds(jid: string, ids: string[]): Promise<void>;

  deleteAllByJid(jid: string): Promise<void>;

  /**
   * Returns the newest message for each of the given JIDs.
   * Executes a single query (MAX + GROUP BY / window function) for efficiency.
   */
  getNewestPerJid(jids: string[]): Promise<Map<string, any>>;
}

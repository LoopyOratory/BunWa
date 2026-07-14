import type { Chat, Contact, GroupMetadata, proto } from '@whiskeysockets/baileys';
import type makeWASocket from '@whiskeysockets/baileys';
import type { Label } from '@whiskeysockets/baileys/lib/Types/Label';
import { BadRequestException } from '../../../exceptions';
import {
  GetChatMessagesFilter,
  OverviewFilter,
} from '../../../../structures/chats.dto';
import { LidToPhoneNumber } from '../../../../structures/lids.dto';
import {
  LimitOffsetParams,
  PaginationParams,
} from '../../../../structures/pagination.dto';
import { PaginatorInMemory } from '../../../../utils/Paginator';

import { INowebStore } from './INowebStore';
import makeInMemoryStore from './memory/make-in-memory-store';
import pino from 'pino';

const logger = pino();

export class NowebInMemoryStore implements INowebStore {
  private socket!: ReturnType<typeof makeWASocket>;

  private store: ReturnType<typeof makeInMemoryStore>;
  errorMessage =
    'Enable NOWEB store "config.noweb.store.enabled=True" and "config.noweb.store.full_sync=True" when starting a new session. ' +
    'Read more: https://waha.devlike.pro/docs/engines/noweb#store';

  constructor() {
    this.store = makeInMemoryStore({ logger: logger });
    const presences = {};
    this.store.presences = presences;
    // Adjust inline even handler
    this.store.setPresences(presences);
  }

  init(): Promise<void> {
    return;
  }

  close(): Promise<void> {
    return;
  }

  get presences() {
    return this.store.presences;
  }

  bind(ev: any, socket: any) {
    this.store.bind(ev);
    this.socket = socket;
  }

  loadMessage(jid: string, id: string): Promise<proto.IWebMessageInfo> {
    return this.store.loadMessage(jid, id);
  }

  getMessagesByJid(
    chatId: string,
    filter: GetChatMessagesFilter,
    pagination: PaginationParams,
    merge?: boolean,
  ): Promise<any> {
    throw new BadRequestException(this.errorMessage);
  }

  getMessageById(
    chatId: string,
    messageId: string,
    merge?: boolean,
  ): Promise<any> {
    throw new BadRequestException(this.errorMessage);
  }

  getNewestPerJid(jids: string[]): Promise<Map<string, any>> {
    throw new BadRequestException(this.errorMessage);
  }

  runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  getChats(
    pagination: PaginationParams,
    broadcast: boolean,
    filter?: OverviewFilter,
    merge?: boolean,
  ): Promise<Chat[]> {
    throw new BadRequestException(this.errorMessage);
  }

  getChat(jid: string): Promise<Chat | null> {
    return null;
  }

  getContacts(pagination: PaginationParams): Promise<Contact[]> {
    throw new BadRequestException(this.errorMessage);
  }

  getContactById(jid: string): Promise<Contact> {
    throw new BadRequestException(this.errorMessage);
  }

  async getContactsByIds(jids: string[]): Promise<Map<string, Contact>> {
    throw new BadRequestException(this.errorMessage);
  }

  getLabels(): Promise<Label[]> {
    throw new BadRequestException(this.errorMessage);
  }

  getLabelById(labelId: string): Promise<Label | null> {
    throw new BadRequestException(this.errorMessage);
  }

  getChatsByLabelId(labelId: string): Promise<Chat[]> {
    throw new BadRequestException(this.errorMessage);
  }

  getChatLabels(chatId: string): Promise<Label[]> {
    throw new BadRequestException(this.errorMessage);
  }

  async getGroups(pagination: PaginationParams): Promise<GroupMetadata[]> {
    const response = await this.socket?.groupFetchAllParticipating();
    const groups: any[] = Object.values(response);
    const paginator = new PaginatorInMemory(pagination);
    return paginator.apply(groups);
  }

  async getGroupById(id: string): Promise<GroupMetadata | null> {
    const response = await this.socket?.groupFetchAllParticipating();
    return response?.[id] || null;
  }

  async deleteGroupById(id: string): Promise<void> {
    // In-memory store doesn't persist, no-op
  }

  resetGroupsCache() {
    return;
  }

  //
  // Lids methods
  //
  getAllLids(pagination?: LimitOffsetParams): Promise<LidToPhoneNumber[]> {
    throw new BadRequestException(this.errorMessage);
  }

  findLidByPN(pn: string): Promise<string | null> {
    throw new BadRequestException(this.errorMessage);
  }

  findPNByLid(lid: string): Promise<string | null> {
    throw new BadRequestException(this.errorMessage);
  }

  getLidsCount(): Promise<number> {
    throw new BadRequestException(this.errorMessage);
  }
}

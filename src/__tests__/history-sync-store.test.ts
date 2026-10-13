import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { NowebPersistentStore } from '../core/engines/noweb/store/NowebPersistentStore';
import { JidFilter } from '../core/utils/jids';
import type { HistoryBatch } from '../core/engines/noweb/store/HistorySyncTracker';

/**
 * A messaging-history.set batch is stored the same way as live messages:
 * chats the session ignores are dropped before the write, and the tracker is
 * told how many messages actually landed. The old order kept messages from
 * ignored chats and never reported anything.
 */

function fakeStorage(upserted: any[]) {
  // Every repository method resolves to an empty list, except message upserts,
  // which are recorded.
  const repo = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => async (arg: any) => {
          if (name === 'messages' && method === 'upsert') upserted.push(...arg);
          return [];
        },
      },
    );
  return {
    getChatRepository: () => repo('chats'),
    getGroupRepository: () => repo('groups'),
    getContactsRepository: () => repo('contacts'),
    getMessagesRepository: () => repo('messages'),
    getLabelsRepository: () => repo('labels'),
    getLabelAssociationRepository: () => repo('labelAssociations'),
    getLidPNRepository: () => repo('lids'),
  } as any;
}

const logger: any = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {}, trace: () => {}, child: () => logger };

const text = (remoteJid: string, id: string) => ({
  key: { remoteJid, id, fromMe: false },
  message: { conversation: 'hi' },
  messageTimestamp: 1_700_000_000,
});

describe('history sync in the persistent store', () => {
  it('drops ignored chats before storing and reports what landed', async () => {
    const upserted: any[] = [];
    const batches: HistoryBatch[] = [];
    const store = new NowebPersistentStore(
      logger,
      fakeStorage(upserted),
      new JidFilter({ status: false, groups: true, channels: false, broadcast: false }),
      (batch) => batches.push(batch),
    );

    await (store as any).onMessagingHistorySet({
      contacts: [],
      chats: [{ id: '233553919737@s.whatsapp.net' }],
      messages: [text('233553919737@s.whatsapp.net', 'A'), text('120363000000000000@g.us', 'B')],
      progress: 40,
      syncType: 2,
      isLatest: false,
    });

    expect(upserted.map((m) => m.key.id)).toEqual(['A']);
    expect(batches).toEqual([
      { messages: 1, chats: 1, contacts: 0, progress: 40, syncType: 2, isLatest: false },
    ]);
  });
});

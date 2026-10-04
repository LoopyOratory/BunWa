import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { BulkMessageService } from '../core/bulk-message.service';
import { toVcardV3 } from '../core/vcard';

// Bulk text used to fail for every recipient because the route wired the
// service to session.sendTextMessage()/sendImageMessage()/... methods that no
// session class defines. These tests pin the delegate contract the route now
// provides: request-shaped engine calls, and media content dispatched to the
// matching sender instead of being silently ignored.
describe('BulkMessageService delivery', () => {
  const recipient = { chatId: '233553919737@c.us' };

  it('delivers text through the text sender and records sent', async () => {
    const calls: Array<[string, string]> = [];
    const service = new BulkMessageService(async (chatId, text) => {
      calls.push([chatId, text]);
      return 'ok';
    });
    const batch = service.createBatch('session-a', [recipient], { text: 'Bulk hello' });
    await service.processBatch(batch.id);

    expect(calls).toEqual([['233553919737@c.us', 'Bulk hello']]);
    expect(batch.sent).toBe(1);
    expect(batch.failed).toBe(0);
    expect(batch.status).toBe('completed');
    expect(batch.results).toEqual([{ chatId: '233553919737@c.us', status: 'sent' }]);
  });

  it('dispatches base64 image content to the image sender', async () => {
    const calls: Array<{ chatId: string; caption?: string; bytes: number }> = [];
    const service = new BulkMessageService(
      async () => 'text',
      async (chatId, buffer, caption) => {
        calls.push({ chatId, caption, bytes: buffer.length });
        return 'ok';
      },
    );
    const image = Buffer.from('drill image bytes').toString('base64');
    const batch = service.createBatch('session-a', [recipient], {
      caption: 'Bulk image',
      image: { base64: image },
    });
    await service.processBatch(batch.id);

    expect(calls).toHaveLength(1);
    expect(calls[0].chatId).toBe('233553919737@c.us');
    expect(calls[0].caption).toBe('Bulk image');
    expect(calls[0].bytes).toBe('drill image bytes'.length);
    expect(batch.sent).toBe(1);
  });

  it('dispatches base64 document content with filename and mimetype', async () => {
    const calls: Array<{ filename?: string; mimetype?: string }> = [];
    const service = new BulkMessageService(
      async () => 'text',
      undefined,
      undefined,
      undefined,
      async (_chatId, _buffer, filename, mimetype) => {
        calls.push({ filename, mimetype });
        return 'ok';
      },
    );
    const batch = service.createBatch('session-a', [recipient], {
      document: {
        base64: Buffer.from('doc').toString('base64'),
        filename: 'drill.txt',
        mimetype: 'text/plain',
      },
    });
    await service.processBatch(batch.id);

    expect(calls).toEqual([{ filename: 'drill.txt', mimetype: 'text/plain' }]);
    expect(batch.sent).toBe(1);
  });

  it('records a failed recipient when the sender throws', async () => {
    const service = new BulkMessageService(async () => {
      throw new Error('session.sendText is not a function');
    });
    const batch = service.createBatch('session-a', [recipient], { text: 'nope' });
    await service.processBatch(batch.id);

    expect(batch.failed).toBe(1);
    expect(batch.sent).toBe(0);
    expect(batch.results[0].status).toBe('failed');
    expect(batch.results[0].error).toContain('not a function');
  });
});

describe('toVcardV3 field mapping', () => {
  it('uses the documented fullName and phoneNumber fields', () => {
    const vcard = toVcardV3([
      { fullName: 'Drill Contact', phoneNumber: '233553919737', organization: 'BunWa' },
    ]);
    expect(vcard).toContain('FN:Drill Contact');
    expect(vcard).toContain('TEL;TYPE=CELL:233553919737');
    expect(vcard).toContain('ORG:BunWa');
  });

  it('still accepts the legacy name and phone fields', () => {
    const vcard = toVcardV3([{ name: 'Legacy', phone: '15551234567' }]);
    expect(vcard).toContain('FN:Legacy');
    expect(vcard).toContain('TEL;TYPE=CELL:15551234567');
  });
});

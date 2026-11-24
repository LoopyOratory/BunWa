import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WebJSMediaProcessor } from '../core/engines/webjs/webjs.media-processor';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';

const silent = {
  child: () => ({ info() {}, debug() {}, warn() {}, error() {}, trace() {} }),
} as any;

function webjsSession() {
  return new WhatsappSessionWebJs({
    name: 'webjs-media-test',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: silent,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  }) as any;
}

function fakeMessage(overrides: Record<string, any> = {}) {
  return {
    id: { _serialized: 'false_15551234567@c.us_M1', id: 'M1' },
    from: '15551234567@c.us',
    hasMedia: true,
    _data: { mimetype: 'image/png', filename: 'photo.png' },
    downloadMedia: async () => ({
      data: Buffer.from('image-bytes').toString('base64'),
      mimetype: 'image/png',
      filename: 'photo.png',
    }),
    ...overrides,
  };
}

describe('WebJSMediaProcessor', () => {
  it('downloads whatsapp-web.js media into bytes', async () => {
    const processor = new WebJSMediaProcessor();
    const message = fakeMessage();
    expect(processor.hasMedia(message)).toBe(true);
    expect(await processor.getMediaBuffer(message)).toEqual(Buffer.from('image-bytes'));
  });

  it('reports metadata used by the storage layout', () => {
    const processor = new WebJSMediaProcessor();
    const message = fakeMessage();
    expect(processor.getFilename(message)).toBe('photo.png');
    expect(processor.getMimetype(message)).toBe('image/png');
    expect(processor.getMessageId(message)).toBe('false_15551234567@c.us_M1');
    expect(processor.getChatId(message)).toBe('15551234567@c.us');
  });

  it('returns null when the download yields no data', async () => {
    const processor = new WebJSMediaProcessor();
    expect(await processor.getMediaBuffer(fakeMessage({ downloadMedia: async () => null }))).toBeNull();
  });
});

describe('WEBJS media attachment', () => {
  it('publishes media and mediaUrl like BUNWEB', async () => {
    const session = webjsSession();
    const stored: any[] = [];
    session.mediaManager = {
      processMedia: async () => {
        stored.push('called');
        return {
          url: 'http://test/api/files/webjs-media-test/M1.png',
          mimetype: 'image/png',
          filename: 'photo.png',
        };
      },
    };

    const waMessage: any = { hasMedia: true };
    await session.attachMedia(fakeMessage(), waMessage);

    expect(stored).toHaveLength(1);
    expect(waMessage.media.url).toBe('http://test/api/files/webjs-media-test/M1.png');
    expect(waMessage.mediaUrl).toBe(waMessage.media.url);
  });

  it('keeps the message when media storage fails', async () => {
    const session = webjsSession();
    session.mediaManager = {
      processMedia: async () => {
        throw new Error('disk full');
      },
    };
    const waMessage: any = { hasMedia: true };
    await expect(session.attachMedia(fakeMessage(), waMessage)).resolves.toBeUndefined();
    expect(waMessage.media).toBeUndefined();
  });
});

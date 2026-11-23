import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MediaLocalStorage } from '../core/media/MediaLocalStorage';
import { MediaManager } from '../core/media/MediaManager';
import { MediaData } from '../core/media/IMediaManager';

const silent = { info() {}, debug() {}, warn() {}, error() {} } as any;

function media(overrides: Partial<MediaData> = {}): MediaData {
  return {
    session: 'demo',
    message: { id: 'ABC123', chatId: '1@c.us' },
    file: { extension: 'png', mimetype: 'image/png', filename: 'photo.png' },
    ...overrides,
  };
}

describe('MediaLocalStorage', () => {
  let root: string;
  let storage: MediaLocalStorage;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunwa-media-store-'));
    storage = new MediaLocalStorage(silent, root, 'http://test/api/files', 60);
  });

  afterEach(async () => {
    await storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('stores media under <root>/<session>/<id>.<ext> and builds a served URL', async () => {
    const data = media();
    expect(await storage.save(Buffer.from('png-bytes'), data)).toBe(true);
    const stored = path.join(root, 'demo', 'ABC123.png');
    expect(fs.existsSync(stored)).toBe(true);
    expect(await storage.exists(data)).toBe(true);
    expect(await storage.getStorageData(data)).toEqual({
      url: 'http://test/api/files/demo/ABC123.png',
    });
  });

  it('keeps a hostile id and extension inside the session directory', async () => {
    const data = media({
      message: { id: '../../evil', chatId: '1@c.us' },
      file: { extension: '../../x', mimetype: 'text/plain', filename: 'x' },
    });
    expect(await storage.save(Buffer.from('x'), data)).toBe(true);

    const stored = await fs.promises.readdir(path.join(root, 'demo'));
    expect(stored).toHaveLength(1);
    const name = stored[0];
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(name.endsWith('.bin')).toBe(true);

    // exists() and the URL use the same sanitized name.
    expect(await storage.exists(data)).toBe(true);
    expect((await storage.getStorageData(data)).url).toContain(name);
  });

  it('purges only files older than the lifetime', async () => {
    const oldData = media({ message: { id: 'OLD', chatId: '1@c.us' } });
    const newData = media({ message: { id: 'NEW', chatId: '1@c.us' } });
    await storage.save(Buffer.from('old'), oldData);
    await storage.save(Buffer.from('new'), newData);

    const oldPath = path.join(root, 'demo', 'OLD.png');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await fs.promises.utimes(oldPath, twoHoursAgo, twoHoursAgo);

    await storage.purge();

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(path.join(root, 'demo', 'NEW.png'))).toBe(true);
  });

  it('resumes sweeping after close() when the session restarts', async () => {
    await storage.save(Buffer.from('x'), media());
    await storage.close();
    // A restarted session reuses the storage instance; the next write must
    // re-arm cleanup rather than leaving files to accumulate.
    expect(await storage.save(Buffer.from('y'), media({ message: { id: 'B', chatId: '1@c.us' } }))).toBe(true);
    await storage.purge();
    expect(fs.existsSync(path.join(root, 'demo', 'B.png'))).toBe(true);
  });
});

describe('BUNWEB inbound media', () => {
  it('exposes the stored URL on both media and mediaUrl', async () => {
    const { WhatsappSessionBunWebCore } = await import(
      '../core/engines/bunweb/session.bunweb.core'
    );
    const session: any = new WhatsappSessionBunWebCore({
      name: 'bunweb-media',
      printQR: false,
      loggerBuilder: {
        child: () => ({ info() {}, debug() {}, warn() {}, error() {}, trace() {} }),
      },
      sessionStore: {} as any,
      mediaManager: {} as any,
      engineConfig: {},
      sessionConfig: {},
      ignore: { status: false, groups: false, channels: false, broadcast: false },
    });
    session.mediaManager = {
      processMedia: async () => ({
        url: 'http://test/api/files/demo/M1.png',
        mimetype: 'image/png',
        filename: 'photo.png',
      }),
    };

    const message = {
      key: { id: 'M1', remoteJid: '15551234567@s.whatsapp.net', fromMe: false },
      message: { imageMessage: { mimetype: 'image/png', caption: 'hi' } },
      messageTimestamp: 1_700_000_000,
    };
    const result = await session.processIncomingMessage(message, true);

    expect(result?.media?.url).toBe('http://test/api/files/demo/M1.png');
    // The Chatwoot bridge reads only mediaUrl; it used to be undefined even
    // though the file had been stored.
    expect(result?.mediaUrl).toBe('http://test/api/files/demo/M1.png');
  });
});

describe('MediaManager', () => {
  it('closes its storage backend instead of leaving it running', () => {
    let closed = 0;
    const storage = {
      save: async () => true,
      exists: async () => true,
      getStorageData: async () => ({ url: '' }),
      purge: async () => {},
      close: async () => {
        closed += 1;
      },
    };
    const manager = new MediaManager(storage as any, [], silent);
    manager.close();
    expect(closed).toBe(1);
  });

  it('returns null when the backend reports a failed save', async () => {
    const storage = {
      save: async () => false,
      exists: async () => false,
      getStorageData: async () => ({ url: 'http://test/x' }),
      purge: async () => {},
      close: async () => {},
    };
    const manager = new MediaManager(storage as any, [], silent);
    const processor = {
      hasMedia: () => true,
      getFilename: () => 'a.png',
      getMimetype: () => 'image/png',
      getMessageId: () => 'M1',
      getChatId: () => '1@c.us',
      getMediaBuffer: async () => Buffer.from('bytes'),
    };
    // A URL for a file that was never written would 404 for the caller.
    expect(await manager.processMedia(processor as any, {}, 'demo')).toBeNull();
  });
});

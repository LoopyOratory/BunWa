import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  UploadStore,
  PayloadTooLargeException,
  mimetypeForFilename,
} from '../core/uploads/upload-store';
import { UnprocessableEntityException } from '../core/exceptions';

let root: string;
let store: UploadStore;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bunwa-uploads-'));
  store = new UploadStore(root);
});

describe('UploadStore', () => {
  it('saves bytes with metadata and reads them back', async () => {
    const rec = await store.save('vivita', new Blob(['hello zip']), { filename: 'ads.zip', maxBytes: 1024 });
    expect(rec.session).toBe('vivita');
    expect(rec.filename).toBe('ads.zip');
    expect(rec.mimetype).toBe('application/zip');
    expect(rec.size).toBe(9);
    expect(existsSync(join(root, 'vivita', 'uploads', rec.id))).toBe(true);
    const got = await store.get('vivita', rec.id);
    expect(got).toEqual(rec);
    expect(await Bun.file(store.dataPath('vivita', rec.id)).text()).toBe('hello zip');
  });

  it('keeps an explicit mimetype and defaults the filename', async () => {
    const rec = await store.save('vivita', new Blob(['x']), { mimetype: 'image/png', maxBytes: 10 });
    expect(rec.mimetype).toBe('image/png');
    expect(rec.filename).toBe('file');
  });

  it('rejects an oversized upload and leaves nothing behind', async () => {
    await expect(
      store.save('vivita', new Blob(['0123456789AB']), { filename: 'a.bin', maxBytes: 10 }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect((await store.list('vivita')).length).toBe(0);
  });

  it('rejects an empty upload', async () => {
    await expect(store.save('vivita', new Blob([]), { maxBytes: 10 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('refuses traversal in session and id', async () => {
    await expect(store.save('../x', new Blob(['a']), { maxBytes: 10 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(store.get('vivita', '../../etc/passwd')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('does not see another session\'s upload', async () => {
    const rec = await store.save('a', new Blob(['a']), { maxBytes: 10 });
    expect(await store.get('b', rec.id)).toBeNull();
  });

  it('lists, deletes and sweeps expired uploads', async () => {
    const keep = await store.save('vivita', new Blob(['k']), { maxBytes: 10 });
    const old = await store.save('vivita', new Blob(['o']), { maxBytes: 10 });
    expect((await store.list('vivita')).map((r) => r.id).sort()).toEqual([keep.id, old.id].sort());
    const removed = await store.sweep(Date.parse(old.expiresAt) + 1);
    expect(removed).toBe(2);
    expect(await store.list('vivita')).toEqual([]);
    const again = await store.save('vivita', new Blob(['z']), { maxBytes: 10 });
    expect(await store.delete('vivita', again.id)).toBe(true);
    expect(await store.delete('vivita', again.id)).toBe(false);
  });

  it('maps common extensions', () => {
    expect(mimetypeForFilename('a.png')).toBe('image/png');
    expect(mimetypeForFilename('noext')).toBe('application/octet-stream');
  });
});

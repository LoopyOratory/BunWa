import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadStore } from '../core/uploads/upload-store';
import { parseUploadRef, resolveUploadFile, resolveUploadRefs } from '../core/uploads/resolve-upload-refs';
import { UnprocessableEntityException } from '../core/exceptions';

const store = new UploadStore(mkdtempSync(join(tmpdir(), 'bunwa-resolve-')));

describe('upload references', () => {
  it('parses the string and object forms', () => {
    expect(parseUploadRef('upload:abc')).toEqual({ id: 'abc' });
    expect(parseUploadRef({ upload: 'abc', filename: 'x.zip' })).toEqual({ id: 'abc', filename: 'x.zip', mimetype: undefined });
    expect(parseUploadRef('https://x/y.png')).toBeNull();
    expect(parseUploadRef({ url: 'https://x' })).toBeNull();
  });

  it('replaces a reference with bytes, mimetype and filename', async () => {
    const rec = await store.save('vivita', new Blob(['PK-zip']), { filename: 'ads.zip', maxBytes: 100 });
    const out: any = await resolveUploadFile('vivita', `upload:${rec.id}`, store);
    expect(Buffer.isBuffer(out.data)).toBe(true);
    expect(out.data.toString()).toBe('PK-zip');
    expect(out.mimetype).toBe('application/zip');
    expect(out.filename).toBe('ads.zip');
  });

  it('lets explicit filename and mimetype win', async () => {
    const rec = await store.save('vivita', new Blob(['x']), { filename: 'a.bin', maxBytes: 10 });
    const out: any = await resolveUploadFile('vivita', { upload: rec.id, filename: 'b.pdf', mimetype: 'application/pdf' }, store);
    expect(out.filename).toBe('b.pdf');
    expect(out.mimetype).toBe('application/pdf');
  });

  it('passes non-references through untouched', async () => {
    const input = { url: 'https://x/y.png' };
    expect(await resolveUploadFile('vivita', input, store)).toBe(input);
    expect(await resolveUploadFile('vivita', 'aGVsbG8=', store)).toBe('aGVsbG8=');
  });

  it('refuses an unknown id or one from another session', async () => {
    const rec = await store.save('other', new Blob(['x']), { maxBytes: 10 });
    await expect(resolveUploadFile('vivita', `upload:${rec.id}`, store)).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(resolveUploadFile('vivita', 'upload:missing', store)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('resolves body.file in place', async () => {
    const rec = await store.save('vivita', new Blob(['img']), { filename: 'a.png', maxBytes: 10 });
    const body: any = { chatId: 'x@c.us', file: `upload:${rec.id}`, caption: 'hi' };
    const out = await resolveUploadRefs('vivita', body, store);
    expect(out).toBe(body);
    expect(body.file.mimetype).toBe('image/png');
    expect(body.caption).toBe('hi');
  });
});

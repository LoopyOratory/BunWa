import 'reflect-metadata';
import { describe, it, expect, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isBase64,
  isHttpUrl,
  isPathLike,
  parseDataUrl,
  readMediaFile,
  resolveMediaInput,
} from '../core/media/media-input';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bunwa-media-'));
const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const pngPath = path.join(tmpDir, 'pixel.png');
fs.writeFileSync(pngPath, pngBytes);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('media input predicates', () => {
  it('recognizes URLs, paths and base64 without confusing them', () => {
    expect(isHttpUrl('https://example.com/a.png')).toBe(true);
    expect(isHttpUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isPathLike('/opt/data/a.png')).toBe(true);
    expect(isPathLike('./a.png')).toBe(true);
    expect(isPathLike('C:\\media\\a.png')).toBe(true);
    expect(isPathLike('a.png')).toBe(false);
    // A real path contains '.', which is outside the base64 alphabet.
    expect(isBase64('/opt/data/a.png')).toBe(false);
    expect(isBase64('AAAA')).toBe(true);
  });

  it('parses a data URL and keeps its mimetype', () => {
    const parsed = parseDataUrl('data:image/png;base64,AAAA');
    expect(parsed?.mimetype).toBe('image/png');
    expect(parsed?.buffer.toString('base64')).toBe('AAAA');
    expect(parseDataUrl('https://example.com/a.png')).toBeNull();
    expect(() => parseDataUrl('data:image/png;base64')).toThrow();
  });
});

describe('resolveMediaInput', () => {
  it('passes a Buffer through', () => {
    expect(resolveMediaInput(pngBytes).buffer).toBe(pngBytes);
  });

  it('decodes a data URL and carries the mimetype', () => {
    const resolved = resolveMediaInput('data:image/jpeg;base64,AAAA');
    expect(resolved.buffer?.toString('base64')).toBe('AAAA');
    expect(resolved.mimetype).toBe('image/jpeg');
  });

  it('keeps an http(s) URL as a URL', () => {
    expect(resolveMediaInput('https://example.com/a.png')).toEqual({
      url: 'https://example.com/a.png',
    });
  });

  it('decodes bare base64, including a JPEG that looks like a path', () => {
    // "/9j/" is the start of a base64 JPEG and also looks like an absolute path.
    const jpeg = '/9j/4AAQSkZJRg==';
    expect(resolveMediaInput(jpeg).buffer).toBeDefined();
  });

  it('keeps a local path as a path instead of decoding it as base64', () => {
    expect(resolveMediaInput(pngPath)).toEqual({ path: pngPath });
  });

  it('normalizes object inputs and their declared metadata', () => {
    expect(
      resolveMediaInput({ url: 'https://example.com/a.pdf', mimetype: 'application/pdf', filename: 'a.pdf' }),
    ).toEqual({
      url: 'https://example.com/a.pdf',
      mimetype: 'application/pdf',
      filename: 'a.pdf',
    });
    expect(
      resolveMediaInput({ data: pngBytes, mimeType: 'image/png' }).buffer,
    ).toBe(pngBytes);
    expect(
      resolveMediaInput({ data: 'AAAA', mimetype: 'image/gif' }),
    ).toEqual({ buffer: Buffer.from('AAAA', 'base64'), mimetype: 'image/gif', filename: undefined });
  });

  it('rejects an unsupported input with a client error', () => {
    expect(() => resolveMediaInput(42)).toThrow(/Unsupported file input/);
    expect(() => resolveMediaInput(null)).toThrow(/Unsupported file input/);
  });
});

describe('readMediaFile', () => {
  it('reads real bytes', async () => {
    expect(await readMediaFile(pngPath)).toEqual(pngBytes);
  });

  it('maps a missing file to a named 422 instead of ENOENT', async () => {
    await expect(readMediaFile(path.join(tmpDir, 'nope.png'))).rejects.toThrow(
      /Could not read the local media file/,
    );
  });
});

describe('WEBJS media materialization', () => {
  const session = new WhatsappSessionWebJs({
    name: 'webjs-media',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({ info() {}, debug() {}, warn() {}, error() {}, trace() {} }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  });

  it('reads a local path instead of base64-encoding the path string', async () => {
    const media = await (session as any).toMessageMedia(pngPath, 'image/png');
    expect(media.data).toBe(pngBytes.toString('base64'));
    expect(media.mimetype).toBe('image/png');
  });

  it('uses the declared mimetype and filename for document objects', async () => {
    const media = await (session as any).toMessageMedia(
      { data: pngBytes, mimetype: 'application/pdf', filename: 'invoice.pdf' },
      'application/octet-stream',
      'file',
    );
    expect(media.mimetype).toBe('application/pdf');
    expect(media.filename).toBe('invoice.pdf');
    expect(media.data).toBe(pngBytes.toString('base64'));
  });

  it('prefers the data URL mimetype over the fallback', async () => {
    const media = await (session as any).toMessageMedia(
      'data:image/webp;base64,AAAA',
      'image/png',
    );
    expect(media.mimetype).toBe('image/webp');
  });
});

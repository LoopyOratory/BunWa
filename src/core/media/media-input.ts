/**
 * Media input normalization shared by the BUNWEB and WEBJS engines.
 *
 * Both engines accept the same file shapes from the API:
 *   - a Buffer
 *   - a { data, mimetype, filename } object (data as base64 or a data URL)
 *   - a { url } object
 *   - a data URL ("data:image/png;base64,...")
 *   - a bare base64 string
 *   - an http(s) URL
 *   - a local file path
 *
 * BUNWEB hands a URL or a path to Baileys and lets it stream the bytes; WEBJS
 * needs real bytes for `MessageMedia`. Keeping the shape detection here means
 * the two engines cannot drift on what they accept, and it removes the copy of
 * these predicates that used to live inside the BUNWEB session class.
 */

import * as fs from 'fs';
import { UnprocessableEntityException } from '../exceptions';

export const UNSUPPORTED_FILE_INPUT =
  'Unsupported file input. Use a { data, mimetype } object, a data URL, a base64 string, an http(s) URL or a local file path.';

/** True for absolute, relative, home or Windows-drive paths. */
export function isPathLike(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('~/') ||
    value.startsWith('\\\\') ||
    /^[A-Za-z]:[\\/]/.test(value)
  );
}

/** True for a syntactically valid base64 string (not a file path). */
export function isBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export interface ParsedDataUrl {
  buffer: Buffer;
  mimetype?: string;
}

/**
 * Parse a `data:` URL. Returns null when the string is not a data URL.
 * A malformed data URL (no comma) is a client error, not a silent fallback.
 */
export function parseDataUrl(value: string): ParsedDataUrl | null {
  if (!value.startsWith('data:')) return null;
  const comma = value.indexOf(',');
  if (comma === -1) {
    throw new UnprocessableEntityException(UNSUPPORTED_FILE_INPUT);
  }
  const header = value.slice(5, comma);
  const payload = value.slice(comma + 1);
  const isBase64Payload = /;base64$/i.test(header);
  const mimetype = header.split(';')[0] || undefined;
  return {
    buffer: Buffer.from(payload, isBase64Payload ? 'base64' : 'utf8'),
    mimetype,
  };
}

export interface MediaFileObject {
  data?: string | Buffer;
  url?: string;
  mimetype?: string;
  mimeType?: string;
  filename?: string;
  fileName?: string;
}

export interface ResolvedMedia {
  /** Bytes when the input can be materialized without I/O (buffer, base64, data URL). */
  buffer?: Buffer;
  /** http(s) URL the engine can stream. */
  url?: string;
  /** Local path the engine can read. */
  path?: string;
  mimetype?: string;
  filename?: string;
}

/**
 * Normalize one accepted media input into exactly one of buffer/url/path,
 * carrying the declared mimetype and filename when the caller supplied them.
 *
 * No I/O happens here: deciding whether to stream a URL or read a path is the
 * engine's job (Baileys streams; MessageMedia needs bytes).
 */
export function resolveMediaInput(file: unknown): ResolvedMedia {
  if (Buffer.isBuffer(file)) {
    return { buffer: file };
  }

  if (typeof file === 'string') {
    if (!file) throw new UnprocessableEntityException(UNSUPPORTED_FILE_INPUT);
    const dataUrl = parseDataUrl(file);
    if (dataUrl) {
      return { buffer: dataUrl.buffer, mimetype: dataUrl.mimetype };
    }
    if (isHttpUrl(file)) {
      return { url: file };
    }
    // A base64 payload starts with "/9j/" for JPEG, which looks like an
    // absolute path — so test base64 before the path branch. A real path
    // contains '.' or '-' (outside the base64 alphabet) and is not matched.
    const compact = file.replace(/\s+/g, '');
    if (compact.length > 0 && isBase64(compact)) {
      return { buffer: Buffer.from(compact, 'base64') };
    }
    return { path: file };
  }

  if (file && typeof file === 'object') {
    const object = file as MediaFileObject;
    const mimetype = object.mimetype ?? object.mimeType;
    const filename = object.filename ?? object.fileName;

    if (typeof object.data === 'string' && object.data) {
      const dataUrl = parseDataUrl(object.data);
      if (dataUrl) {
        return { buffer: dataUrl.buffer, mimetype: mimetype ?? dataUrl.mimetype, filename };
      }
      return { buffer: Buffer.from(object.data, 'base64'), mimetype, filename };
    }
    if (Buffer.isBuffer(object.data) && object.data.length > 0) {
      return { buffer: object.data, mimetype, filename };
    }
    if (typeof object.url === 'string' && object.url) {
      return { url: object.url, mimetype, filename };
    }
  }

  throw new UnprocessableEntityException(UNSUPPORTED_FILE_INPUT);
}

/** Read a local path into bytes, mapping a filesystem miss to a 422. */
export async function readMediaFile(path: string): Promise<Buffer> {
  try {
    return await fs.promises.readFile(path);
  } catch (error: any) {
    throw new UnprocessableEntityException(
      `Could not read the local media file '${path}': ${error?.message || error}`,
    );
  }
}

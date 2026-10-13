/**
 * Per-session upload store.
 *
 * A caller that holds a file locally (an MCP agent, a script) uploads it once
 * and sends it by reference (`upload:<id>`), instead of pasting base64 through
 * a model or needing a public URL. Files live next to the media the engines
 * download, under `<media>/<session>/uploads/`, with a JSON sidecar.
 */
import { mkdir, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { getLocalMediaFolder } from '../media/MediaStorageFactory';
import { UnprocessableEntityException } from '../exceptions';
import { uploadTtlSeconds } from './upload-config';

export interface UploadRecord {
  id: string;
  session: string;
  filename: string;
  mimetype: string;
  size: number;
  createdAt: string;
  expiresAt: string;
}

export class PayloadTooLargeException extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Upload is larger than the ${maxBytes} byte limit`);
    this.name = 'PayloadTooLargeException';
  }
}

const SAFE_SEGMENT = /^[A-Za-z0-9_.@-]+$/;

export function assertSafeSegment(value: string, label: string): void {
  if (!value || !SAFE_SEGMENT.test(value) || value.includes('..')) {
    throw new UnprocessableEntityException(`Invalid ${label}`);
  }
}

/** Bun infers a MIME type from a file name without touching the disk. */
export function mimetypeForFilename(filename: string): string {
  if (!filename.includes('.')) return 'application/octet-stream';
  return Bun.file(filename).type.split(';')[0] || 'application/octet-stream';
}

export class UploadStore {
  constructor(private readonly rootDir?: string) {}

  private root(): string {
    return this.rootDir ?? getLocalMediaFolder();
  }

  private dir(session: string): string {
    assertSafeSegment(session, 'session');
    return join(this.root(), session, 'uploads');
  }

  dataPath(session: string, id: string): string {
    assertSafeSegment(id, 'upload id');
    return join(this.dir(session), id);
  }

  private metaPath(session: string, id: string): string {
    return `${this.dataPath(session, id)}.json`;
  }

  async save(
    session: string,
    source: Blob | Response | ArrayBuffer | Uint8Array | string,
    opts: { filename?: string; mimetype?: string; maxBytes: number },
  ): Promise<UploadRecord> {
    const id = Bun.randomUUIDv7();
    const dataPath = this.dataPath(session, id);
    await mkdir(this.dir(session), { recursive: true });
    let size: number;
    try {
      size = await Bun.write(dataPath, source as any);
    } catch (error) {
      await rm(dataPath, { force: true });
      throw error;
    }
    if (size > opts.maxBytes) {
      await rm(dataPath, { force: true });
      throw new PayloadTooLargeException(opts.maxBytes);
    }
    if (size === 0) {
      await rm(dataPath, { force: true });
      throw new UnprocessableEntityException('The upload is empty');
    }
    const filename = opts.filename?.trim() || 'file';
    const now = Date.now();
    const record: UploadRecord = {
      id,
      session,
      filename,
      mimetype: opts.mimetype || mimetypeForFilename(filename),
      size,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + uploadTtlSeconds() * 1000).toISOString(),
    };
    await Bun.write(this.metaPath(session, id), JSON.stringify(record));
    return record;
  }

  async get(session: string, id: string): Promise<UploadRecord | null> {
    const meta = Bun.file(this.metaPath(session, id));
    if (!(await meta.exists())) return null;
    const record = (await meta.json()) as UploadRecord;
    if (Date.parse(record.expiresAt) <= Date.now()) {
      await this.delete(session, id);
      return null;
    }
    return record;
  }

  async list(session: string): Promise<UploadRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.dir(session));
    } catch {
      return [];
    }
    const records: UploadRecord[] = [];
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      const record = await this.get(session, name.slice(0, -'.json'.length));
      if (record) records.push(record);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async delete(session: string, id: string): Promise<boolean> {
    const meta = Bun.file(this.metaPath(session, id));
    const existed = await meta.exists();
    await rm(this.dataPath(session, id), { force: true });
    await rm(this.metaPath(session, id), { force: true });
    return existed;
  }

  /** Delete every upload past its expiry, across sessions. Returns the count. */
  async sweep(now: number = Date.now()): Promise<number> {
    let sessions: string[];
    try {
      sessions = await readdir(this.root());
    } catch {
      return 0;
    }
    let removed = 0;
    for (const session of sessions) {
      if (!SAFE_SEGMENT.test(session)) continue;
      let names: string[];
      try {
        names = await readdir(join(this.root(), session, 'uploads'));
      } catch {
        continue;
      }
      for (const name of names.filter((n) => n.endsWith('.json'))) {
        const id = name.slice(0, -'.json'.length);
        try {
          const record = (await Bun.file(this.metaPath(session, id)).json()) as UploadRecord;
          if (Date.parse(record.expiresAt) <= now) {
            await this.delete(session, id);
            removed++;
          }
        } catch {
          // An unreadable sidecar is left for an operator rather than guessed at.
        }
      }
    }
    return removed;
  }
}

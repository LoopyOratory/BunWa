import { IMediaStorage, MediaData, MediaStorageData } from './IMediaManager';
import { mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import pino from 'pino';

/** Extensions that are safe to use as a file-name suffix. */
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/i;

/**
 * Message ids reach WhatsApp as opaque strings; keep only characters that
 * cannot change the path (a stray "/" would move the file out of the session
 * directory, and the file route would then never serve it).
 */
function safeFileStem(id: string | undefined): string {
  return String(id ?? '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 128) || 'media';
}

function safeExtension(extension: string | undefined): string {
  const value = String(extension ?? '').trim();
  return SAFE_EXTENSION.test(value) ? value.toLowerCase() : 'bin';
}

/**
 * Local filesystem media storage.
 *
 * Files live at `<root>/<session>/<id>.<ext>` and are served through
 * `/api/files/<session>/<file>`. A single periodic sweeper removes files older
 * than the configured lifetime.
 *
 * The previous implementation armed one `setTimeout` per saved file. Those
 * timers are lost on a restart (files then leaked forever, because nothing
 * called `purge()`), and a busy session held thousands of pending timers. One
 * unref'd interval per storage instance does the same job with bounded memory.
 */
export class MediaLocalStorage implements IMediaStorage {
  private filesFolder: string;
  private baseUrl: string;
  private lifetimeMs: number;
  private logger: any;
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    logger: any,
    filesFolder: string = process.env.WHATSAPP_FILES_FOLDER || '/tmp/whatsapp-files',
    baseUrl: string = '',
    lifetimeSeconds: number = 180,
  ) {
    this.filesFolder = filesFolder;
    this.baseUrl = baseUrl || `${process.env.BUNWA_BASE_URL || 'http://localhost:3000'}/api/files`;
    this.lifetimeMs = lifetimeSeconds * 1000;
    this.logger = logger || pino({ name: 'MediaLocalStorage' });
  }

  async init(): Promise<void> {
    await mkdir(this.filesFolder, { recursive: true });
    this.ensureSweeper();
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    try {
      const sessionDir = join(this.filesFolder, data.session);
      await mkdir(sessionDir, { recursive: true });
      await Bun.write(join(sessionDir, this.filenameFor(data)), buffer);
      // A storage instance reused after close() (session restart) resumes
      // sweeping on the next write.
      this.ensureSweeper();
      return true;
    } catch (error) {
      this.logger.error(`Failed to save media: ${error}`);
      return false;
    }
  }

  async exists(data: MediaData): Promise<boolean> {
    return Bun.file(join(this.filesFolder, data.session, this.filenameFor(data))).exists();
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    return {
      url: `${this.baseUrl}/${data.session}/${this.filenameFor(data)}`,
    };
  }

  async purge(): Promise<void> {
    // Scan and remove expired files. A missing folder just means nothing to do.
    let sessions: string[];
    try {
      sessions = await readdir(this.filesFolder);
    } catch {
      return;
    }

    for (const session of sessions) {
      const sessionDir = join(this.filesFolder, session);
      let isDirectory = false;
      try {
        isDirectory = (await stat(sessionDir)).isDirectory();
      } catch {
        // Removed between readdir and stat.
      }
      if (!isDirectory) continue;

      let files: string[];
      try {
        files = await readdir(sessionDir);
      } catch {
        continue;
      }
      for (const file of files) {
        const filePath = join(sessionDir, file);
        try {
          const fileStat = await stat(filePath);
          if (Date.now() - fileStat.mtimeMs > this.lifetimeMs) {
            // Ignore cleanup races — another sweep may have removed it already.
            await Bun.file(filePath).delete().catch(() => {});
          }
        } catch {
          // Already gone.
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }

  /** Arm the single expiry sweeper once per live storage instance. */
  private ensureSweeper(): void {
    if (this.sweeper || this.lifetimeMs <= 0) return;
    const everyMs = Math.max(30_000, Math.floor(this.lifetimeMs / 2));
    this.sweeper = setInterval(() => {
      void this.purge().catch((error) =>
        this.logger.warn(`Media purge failed: ${error}`),
      );
    }, everyMs);
    // Cleanup must never keep the process alive.
    this.sweeper.unref?.();
  }

  /** The one place that decides a stored file's name. */
  private filenameFor(data: MediaData): string {
    return `${safeFileStem(data.message.id)}.${safeExtension(data.file.extension)}`;
  }
}

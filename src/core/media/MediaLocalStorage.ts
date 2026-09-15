import { IMediaStorage, MediaData, MediaStorageData } from './IMediaManager';
import { mkdir, readdir, stat } from 'fs/promises';
import { join } from 'path';
import pino from 'pino';

export class MediaLocalStorage implements IMediaStorage {
  private filesFolder: string;
  private baseUrl: string;
  private lifetimeMs: number;
  private logger: any;

  constructor(
    logger: any,
    filesFolder: string = process.env.WHATSAPP_FILES_FOLDER || '/tmp/whatsapp-files',
    baseUrl: string = '',
    lifetimeSeconds: number = 180,
  ) {
    this.filesFolder = filesFolder;
    this.baseUrl = baseUrl || `${process.env.WAHA_BASE_URL || 'http://localhost:3000'}/api/files`;
    this.lifetimeMs = lifetimeSeconds * 1000;
    this.logger = logger || pino({ name: 'MediaLocalStorage' });
  }

  async init(): Promise<void> {
    await mkdir(this.filesFolder, { recursive: true });
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    try {
      const sessionDir = join(this.filesFolder, data.session);
      await mkdir(sessionDir, { recursive: true });

      const filename = `${data.message.id}.${data.file.extension}`;
      const filePath = join(sessionDir, filename);
      await Bun.write(filePath, buffer);

      // Schedule removal after lifetime
      if (this.lifetimeMs > 0) {
        setTimeout(() => {
          // Ignore cleanup errors — the file may already be gone
          Bun.file(filePath).delete().catch(() => {});
        }, this.lifetimeMs);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to save media: ${error}`);
      return false;
    }
  }

  async exists(data: MediaData): Promise<boolean> {
    const filename = `${data.message.id}.${data.file.extension}`;
    const filePath = join(this.filesFolder, data.session, filename);
    return Bun.file(filePath).exists();
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const filename = `${data.message.id}.${data.file.extension}`;
    const url = `${this.baseUrl}/${data.session}/${filename}`;
    return { url };
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
      if (!(await stat(sessionDir)).isDirectory()) continue;

      const files = await readdir(sessionDir);
      for (const file of files) {
        const filePath = join(sessionDir, file);
        const fileStat = await stat(filePath);
        const age = Date.now() - fileStat.mtimeMs;

        if (age > this.lifetimeMs) {
          // Ignore cleanup races — another sweep may have removed it already
          await Bun.file(filePath).delete().catch(() => {});
        }
      }
    }
  }

  async close(): Promise<void> {
    // Nothing to close
  }
}

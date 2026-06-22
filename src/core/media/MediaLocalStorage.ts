import { IMediaStorage, MediaData, MediaStorageData } from './IMediaManager';
import { existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import pino from 'pino';

const writeFile = async (path: string, data: Buffer) => {
  await Bun.write(path, data);
};

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
    if (!existsSync(this.filesFolder)) {
      mkdirSync(this.filesFolder, { recursive: true });
    }
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    try {
      const sessionDir = join(this.filesFolder, data.session);
      if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
      }

      const filename = `${data.message.id}.${data.file.extension}`;
      const filePath = join(sessionDir, filename);
      await writeFile(filePath, buffer);

      // Schedule removal after lifetime
      if (this.lifetimeMs > 0) {
        setTimeout(() => {
          try {
            if (existsSync(filePath)) {
              unlinkSync(filePath);
            }
          } catch (e) {
            // Ignore cleanup errors
          }
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
    return existsSync(filePath);
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const filename = `${data.message.id}.${data.file.extension}`;
    const url = `${this.baseUrl}/${data.session}/${filename}`;
    return { url };
  }

  async purge(): Promise<void> {
    // Scan and remove expired files
    if (!existsSync(this.filesFolder)) return;

    const sessions = readdirSync(this.filesFolder);
    for (const session of sessions) {
      const sessionDir = join(this.filesFolder, session);
      if (!statSync(sessionDir).isDirectory()) continue;

      const files = readdirSync(sessionDir);
      for (const file of files) {
        const filePath = join(sessionDir, file);
        const stat = statSync(filePath);
        const age = Date.now() - stat.mtimeMs;

        if (age > this.lifetimeMs) {
          try {
            unlinkSync(filePath);
          } catch (e) {
            // Ignore
          }
        }
      }
    }
  }

  async close(): Promise<void> {
    // Nothing to close
  }
}

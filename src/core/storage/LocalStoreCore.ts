import { DataStore } from './DataStore';
import { LocalStore } from './LocalStore';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const BASE_DIR = process.env.WAHA_LOCAL_STORE_BASE_DIR || '.sessions';

export class LocalStoreCore extends LocalStore {
  private baseDir: string;
  private engineDir: string;
  private sessionDir: string;

  constructor(namespace: string = 'noweb') {
    super();
    this.baseDir = resolve(process.cwd(), BASE_DIR);
    this.engineDir = join(this.baseDir, namespace);
    this.sessionDir = this.engineDir;
  }

  async init(sessionName?: string): Promise<void> {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
    if (!existsSync(this.engineDir)) {
      mkdirSync(this.engineDir, { recursive: true });
    }
    if (sessionName) {
      const sessionPath = this.getSessionDirectory(sessionName);
      if (!existsSync(sessionPath)) {
        mkdirSync(sessionPath, { recursive: true });
      }
    }
  }

  async close(): Promise<void> {
    // Nothing to close
  }

  getWAHADatabase(): any {
    return null;
  }

  getBaseDirectory(): string {
    return this.baseDir;
  }

  getEngineDirectory(): string {
    return this.engineDir;
  }

  getSessionDirectory(name: string): string {
    return join(this.engineDir, name);
  }

  getFilePath(session: string, file: string): string {
    return join(this.getSessionDirectory(session), file);
  }
}

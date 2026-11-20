import { DataStore } from './DataStore';
import { LocalStore } from './LocalStore';
import { existsSync, mkdirSync } from 'fs';
import { resolveEngineStorageDir } from './storage-namespace';
import { join, resolve } from 'path';

const BASE_DIR = process.env.BUNWA_LOCAL_STORE_BASE_DIR || '.sessions';

export class LocalStoreCore extends LocalStore {
  private baseDir: string;
  private engineDir: string;
  private sessionDir: string;

  constructor(namespace?: string) {
    super();
    this.baseDir = resolve(process.cwd(), BASE_DIR);
    // Default namespace follows the engine-rename compat rule (legacy 'noweb'
    // dir keeps being used where it exists); an explicit namespace is honoured.
    this.engineDir = namespace ? join(this.baseDir, namespace) : resolveEngineStorageDir(this.baseDir);
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

  getBunwaDatabase(): any {
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

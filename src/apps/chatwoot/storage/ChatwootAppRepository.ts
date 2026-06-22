import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ChatwootAppConfig } from '../dto/chatwoot-config.dto';

const STORAGE_FILE = join(process.cwd(), '.sessions', 'chatwoot-apps.json');

export class ChatwootAppRepository {
  private apps: Map<string, ChatwootAppConfig> = new Map();

  async init(): Promise<void> {
    await this.load();
  }

  async findAll(): Promise<ChatwootAppConfig[]> {
    return Array.from(this.apps.values());
  }

  async findById(id: string): Promise<ChatwootAppConfig | null> {
    return this.apps.get(id) || null;
  }

  async findBySession(session: string): Promise<ChatwootAppConfig | null> {
    for (const app of this.apps.values()) {
      if (app.session === session && app.enabled) {
        return app;
      }
    }
    return null;
  }

  async findAllEnabled(): Promise<ChatwootAppConfig[]> {
    return Array.from(this.apps.values()).filter((a) => a.enabled);
  }

  async save(app: ChatwootAppConfig): Promise<void> {
    this.apps.set(app.id, app);
    await this.persist();
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.apps.has(id);
    this.apps.delete(id);
    if (existed) {
      await this.persist();
    }
    return existed;
  }

  private async load(): Promise<void> {
    if (!existsSync(STORAGE_FILE)) {
      return;
    }
    try {
      const file = Bun.file(STORAGE_FILE);
      const content = await file.text();
      const data: ChatwootAppConfig[] = JSON.parse(content);
      for (const app of data) {
        this.apps.set(app.id, app);
      }
    } catch {
      // Corrupted file — start fresh
      this.apps.clear();
    }
  }

  private async persist(): Promise<void> {
    const dir = join(process.cwd(), '.sessions');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const data = Array.from(this.apps.values());
    await Bun.write(STORAGE_FILE, JSON.stringify(data, null, 2));
  }
}

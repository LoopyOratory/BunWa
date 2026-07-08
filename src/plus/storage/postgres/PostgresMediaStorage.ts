import { Pool } from 'pg';
import { MediaData, MediaStorageData } from '../../../core/media/IMediaManager';

export class PostgresMediaStorage {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        session TEXT NOT NULL,
        message_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        mimetype TEXT,
        filename TEXT,
        data BYTEA,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_media_session ON media(session);
      CREATE INDEX IF NOT EXISTS idx_media_message ON media(message_id);
    `);
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    const id = `${data.session}/${data.message.id}`;
    await this.pool.query(
      `INSERT INTO media (id, session, message_id, chat_id, mimetype, filename, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET data = $7`,
      [id, data.session, data.message.id, data.message.chatId, data.file.mimetype, data.file.filename, buffer]
    );
    return true;
  }

  async exists(data: MediaData): Promise<boolean> {
    const id = `${data.session}/${data.message.id}`;
    const result = await this.pool.query('SELECT 1 FROM media WHERE id = $1', [id]);
    return result.rows.length > 0;
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const id = `${data.session}/${data.message.id}`;
    const result = await this.pool.query('SELECT data FROM media WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      throw new Error('Media not found');
    }
    // Return a data URL or temporary file URL
    return {
      url: `data:${data.file.mimetype};base64,${result.rows[0].data.toString('base64')}`,
    };
  }

  async purge(): Promise<void> {
    // Implement TTL-based purging if needed
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

import { Pool } from 'pg';
import { ISessionAuthRepository } from '../../../core/storage/ISessionAuthRepository';

export class PostgresSessionAuthRepository implements ISessionAuthRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(sessionName?: string): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS session_auth (
        session TEXT PRIMARY KEY,
        data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
  }

  async clean(sessionName: string): Promise<void> {
    await this.pool.query('DELETE FROM session_auth WHERE session = $1', [sessionName]);
  }

  async save(sessionName: string, data: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO session_auth (session, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session) DO UPDATE SET data = $2, updated_at = NOW()`,
      [sessionName, JSON.stringify(data)]
    );
  }

  async get(sessionName: string): Promise<any | null> {
    const result = await this.pool.query('SELECT data FROM session_auth WHERE session = $1', [sessionName]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0].data;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

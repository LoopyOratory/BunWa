import { MongoClient, Collection, Db } from 'mongodb';
import { ISessionAuthRepository } from '../../../core/storage/ISessionAuthRepository';

export class MongoSessionAuthRepository implements ISessionAuthRepository {
  private client: MongoClient;
  private db: Db;
  private collection: Collection;

  constructor(connectionString: string, dbName: string = 'waha') {
    this.client = new MongoClient(connectionString);
    this.db = this.client.db(dbName);
    this.collection = this.db.collection('session_auth');
  }

  async init(sessionName?: string): Promise<void> {
    await this.collection.createIndex({ session: 1 }, { unique: true });
  }

  async clean(sessionName: string): Promise<void> {
    await this.collection.deleteMany({ session: sessionName });
  }

  async save(sessionName: string, data: any): Promise<void> {
    await this.collection.updateOne(
      { session: sessionName },
      { $set: { data, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async get(sessionName: string): Promise<any | null> {
    const doc = await this.collection.findOne({ session: sessionName });
    return doc?.data || null;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

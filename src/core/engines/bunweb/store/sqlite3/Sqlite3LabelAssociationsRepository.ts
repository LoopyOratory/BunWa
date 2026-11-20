import type {
  LabelAssociation,
  LabelAssociationType,
} from '@whiskeysockets/baileys/lib/Types/LabelAssociation';
import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import { BunwebLabelAssociationsMetadata } from '../metadata';
import { BunwebLabelAssociationsSchema } from '../schemas';
import { SqlLabelAssociationsMethods } from '../sql/SqlLabelAssociationsMethods';
import { Database } from 'bun:sqlite';

import { BunwebSqlite3KVRepository } from './BunwebSqlite3KVRepository';

export class Sqlite3LabelAssociationsRepository
  extends BunwebSqlite3KVRepository<LabelAssociation>
  implements ILabelAssociationRepository
{
  get schema() {
    return BunwebLabelAssociationsSchema;
  }

  get metadata() {
    return BunwebLabelAssociationsMetadata;
  }

  get methods() {
    return new SqlLabelAssociationsMethods(this);
  }

  constructor(db: Database) {
    super(db);
  }

  async deleteOne(association: LabelAssociation): Promise<void> {
    return this.methods.deleteOne(association);
  }

  async deleteByLabelId(labelId: string): Promise<void> {
    return this.methods.deleteByLabelId(labelId);
  }

  getAssociationsByLabelId(
    labelId: string,
    type: LabelAssociationType,
  ): Promise<LabelAssociation[]> {
    return this.methods.getAssociationsByLabelId(labelId, type);
  }

  getAssociationsByChatId(chatId: string): Promise<LabelAssociation[]> {
    return this.methods.getAssociationsByChatId(chatId);
  }
}

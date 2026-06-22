import type {
  LabelAssociation,
  LabelAssociationType,
} from '@whiskeysockets/baileys/lib/Types/LabelAssociation';
import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import { NowebLabelAssociationsMetadata } from '../metadata';
import { NowebLabelAssociationsSchema } from '../schemas';
import { SqlLabelAssociationsMethods } from '../sql/SqlLabelAssociationsMethods';
import { Database } from 'bun:sqlite';

import { NOWEBBunSqliteKVRepository } from './NOWEBBunSqliteKVRepository';

export class Sqlite3LabelAssociationsRepository
  extends NOWEBBunSqliteKVRepository<LabelAssociation>
  implements ILabelAssociationRepository
{
  get schema() {
    return NowebLabelAssociationsSchema;
  }

  get metadata() {
    return NowebLabelAssociationsMetadata;
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

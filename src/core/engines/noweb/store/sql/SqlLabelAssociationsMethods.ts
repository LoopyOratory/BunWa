import type { LabelAssociation } from '@whiskeysockets/baileys/lib/Types/LabelAssociation';
import { LabelAssociationType } from '../../labels/LabelAssociationType';

// Structural interface: both SqlKVRepository (Postgres/knex) and
// BunSqliteKVRepository (bun:sqlite) implement this shape, and either may be
// passed in depending on the configured storage backend.
interface KVRepositoryLike {
  deleteBy(filters: any): Promise<any>;
  getAllBy(filters: any): Promise<any>;
}

export class SqlLabelAssociationsMethods {
  constructor(private repository: KVRepositoryLike) {}

  async deleteOne(association: LabelAssociation): Promise<void> {
    await this.repository.deleteBy({
      type: association.type,
      chatId: association.chatId,
      labelId: association.labelId,
      // @ts-ignore: messageId doesn't existing in ChatLabelAssociation
      messageId: association.messageId || null,
    });
  }

  async deleteByLabelId(labelId: string): Promise<void> {
    await this.repository.deleteBy({ labelId: labelId });
  }

  getAssociationsByLabelId(
    labelId: string,
    type: LabelAssociationType,
  ): Promise<LabelAssociation[]> {
    return this.repository.getAllBy({
      type: type,
      labelId: labelId,
    });
  }

  getAssociationsByChatId(chatId: string): Promise<LabelAssociation[]> {
    return this.repository.getAllBy({
      chatId: chatId,
      type: LabelAssociationType.Chat,
    });
  }
}

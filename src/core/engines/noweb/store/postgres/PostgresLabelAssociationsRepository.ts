import {
  LabelAssociation,
  LabelAssociationType,
} from '@whiskeysockets/baileys/lib/Types/LabelAssociation';
import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import Knex from 'knex';

export class PostgresLabelAssociationsRepository implements ILabelAssociationRepository {
  constructor(private readonly knex: Knex.Knex) {}

  private buildId(association: LabelAssociation): string {
    return association.type === LabelAssociationType.Message
      ? `${association.chatId}_${association.messageId}_${association.labelId}`
      : `${association.chatId}_${association.labelId}`;
  }

  async deleteOne(association: LabelAssociation): Promise<void> {
    await this.knex('labelAssociations')
      .where({ id: this.buildId(association) })
      .del();
  }

  async save(association: LabelAssociation): Promise<void> {
    await this.knex('labelAssociations')
      .insert({
        id: this.buildId(association),
        type: association.type,
        labelId: association.labelId,
        chatId: association.chatId,
        messageId:
          association.type === LabelAssociationType.Message
            ? association.messageId
            : null,
        data: JSON.stringify(association),
      })
      .onConflict('id')
      .merge();
  }

  async deleteByLabelId(labelId: string): Promise<void> {
    await this.knex('labelAssociations').where({ labelId }).del();
  }

  async getAssociationsByLabelId(
    labelId: string,
    type: LabelAssociationType,
  ): Promise<LabelAssociation[]> {
    const rows = await this.knex('labelAssociations')
      .where({ labelId, type })
      .select('data');
    return rows.map((row) => JSON.parse(row.data));
  }

  async getAssociationsByChatId(chatId: string): Promise<LabelAssociation[]> {
    // Match the SQLite contract: only chat label associations, never the
    // message rows that happen to share the chat id.
    const rows = await this.knex('labelAssociations')
      .where({ chatId, type: LabelAssociationType.Chat })
      .select('data');
    return rows.map((row) => JSON.parse(row.data));
  }
}

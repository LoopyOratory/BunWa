import {
  LabelAssociation,
  LabelAssociationType,
} from '@whiskeysockets/baileys/lib/Types/LabelAssociation';
import { ILabelAssociationRepository } from '../ILabelAssociationsRepository';
import Knex from 'knex';

export class PostgresLabelAssociationsRepository implements ILabelAssociationRepository {
  constructor(private readonly knex: Knex.Knex) {}

  async deleteOne(association: LabelAssociation): Promise<void> {
    await this.knex('labelAssociations').where({ id: association.id }).del();
  }

  async save(association: LabelAssociation): Promise<void> {
    await this.knex('labelAssociations')
      .insert({
        id: association.id,
        type: association.type,
        labelId: association.labelId,
        chatId: association.chatId,
        messageId: association.messageId,
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
    const rows = await this.knex('labelAssociations')
      .where({ chatId })
      .select('data');
    return rows.map((row) => JSON.parse(row.data));
  }
}

import type {
  LabelAssociation,
  LabelAssociationType,
} from '@whiskeysockets/baileys/lib/Types/LabelAssociation';

export class ILabelAssociationRepository {
  deleteOne(association: LabelAssociation): Promise<void>;

  save(association: LabelAssociation): Promise<void>;

  deleteByLabelId(labelId: string): Promise<void>;

  getAssociationsByLabelId(
    labelId: string,
    type: LabelAssociationType,
  ): Promise<LabelAssociation[]>;

  getAssociationsByChatId(chatId: string): Promise<LabelAssociation[]>;
}

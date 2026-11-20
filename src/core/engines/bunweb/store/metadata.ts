import type { WAMessage } from '@whiskeysockets/baileys';
import type { LabelAssociation } from '@whiskeysockets/baileys/lib/Types/LabelAssociation';

export const BunwebMessagesMetadata = new Map()
  .set('jid', (msg: WAMessage) => msg.key.remoteJid)
  .set('id', (msg: WAMessage) => msg.key.id)
  .set('messageTimestamp', (msg: WAMessage) => msg.messageTimestamp);

export const BunwebLabelAssociationsMetadata = new Map().set(
  'id',
  (a: LabelAssociation) =>
    // @ts-ignore
    `${a.type}_${a.labelId}_${a.chatId}_${a.messageId}`,
);

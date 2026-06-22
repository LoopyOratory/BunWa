import { toJID } from './jids';

export function parseMessageIdSerialized(id: string, minimal?: boolean): any {
  if (!id) {
    return { id };
  }
  // WAHA message ID format built by buildMessageId():
  //   {fromMe}_{customerFormat-chatId}_{baileysId}[_{customerFormat-participant}]
  // Example: false_233209933350@c.us_3EB0CA9B...
  // Example: false_123@g.us_3EB0CA9B..._987@c.us
  const parts = id.split('_');
  if (parts.length < 3) {
    return { id };
  }
  const fromMe = parts[0] === 'true';
  const chatId = parts[1];
  const baileysId = parts[2];
  const participant = parts.length > 3 ? parts.slice(3).join('_') : undefined;
  if (minimal) {
    return { id: baileysId, fromMe };
  }
  return {
    id: baileysId,
    fromMe,
    remoteJid: toJID(chatId),
    participant: participant ? toJID(participant) : undefined,
  };
}

export function jidToNonAD(jid: string): string {
  if (!jid || !jid.includes('@')) {
    return jid;
  }
  const [user, server] = jid.split('@', 2);
  return `${user.split(':')[0]}@${server || ''}`;
}

export function getOrigSenderJidForMsgSecret(
  editMessageInfo: { Chat?: string; Sender?: string },
  targetMessageKey: {
    fromMe?: boolean;
    FromMe?: boolean;
    remoteJID?: string;
    RemoteJID?: string;
    participant?: string;
    Participant?: string;
  },
): string {
  const chat = editMessageInfo.Chat || '';
  const server = chat.includes('@') ? chat.split('@')[1] : '';
  const sender = editMessageInfo.Sender || '';

  const fromMe =
    targetMessageKey.fromMe === true || targetMessageKey.FromMe === true;
  const remoteJid =
    targetMessageKey.remoteJID || targetMessageKey.RemoteJID || '';
  const participant =
    targetMessageKey.participant || targetMessageKey.Participant || '';

  if (fromMe) {
    return jidToNonAD(sender);
  }
  if (server === 's.whatsapp.net' || server === 'lid') {
    return jidToNonAD(remoteJid);
  }
  return jidToNonAD(participant);
}

export function decryptSecretEncryptedMessageEditProto(params: {
  encPayload: Uint8Array;
  encIv: Uint8Array;
  origMsgId: string;
  origSenderJid: string;
  modificationSenderJid: string;
  origMsgSecret: Uint8Array;
}): any {
  throw new Error('decryptSecretEncryptedMessageEditProto not implemented');
}

import { normalizeMessageContent, proto } from '@whiskeysockets/baileys';

export function isJidUser(jid: string): boolean {
  return jid?.includes('@s.whatsapp.net') || false;
}

export function isJidGroup(jid: string): boolean {
  return jid?.includes('@g.us') || false;
}

export function isJidNewsletter(jid: string): boolean {
  return jid?.includes('@newsletter') || false;
}

export function IsHistorySyncNotification(message: proto.IMessage): boolean {
  message = normalizeMessageContent(message);
  if (!message) {
    return false;
  }
  if (
    message?.protocolMessage?.type !==
    proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION
  ) {
    return false;
  }
  if (message?.protocolMessage?.historySyncNotification == null) {
    return false;
  }
  return true;
}

export function IsEditedMessage(message: proto.IMessage): boolean {
  message = normalizeMessageContent(message);
  if (!message) {
    return false;
  }
  if (
    message?.protocolMessage?.type !==
    proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
  ) {
    return false;
  }
  if (message?.protocolMessage?.editedMessage == null) {
    return false;
  }
  return true;
}

export function getContextInfo(
  protoMessage: proto.Message | null,
): any {
  const content = protoMessage as any;
  const type = Object.keys(content || {}).find(k => k !== 'conversation');
  const message = content?.[type] as any;
  return message?.contextInfo;
}

export function IsSecretEncryptedMessageEdit(
  message: proto.IMessage | null | undefined,
): boolean {
  const sem = (message as any)?.secretEncryptedMessage;
  if (!sem) {
    return false;
  }
  return true;
}

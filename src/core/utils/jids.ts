export function isJidNewsletter(jid: string | null | undefined) {
  return jid?.endsWith('@newsletter');
}

export function isJidCus(jid: string | null | undefined) {
  return jid?.endsWith('@c.us');
}

export function isJidGroup(jid: string | null | undefined) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export function isJidStatusBroadcast(jid: string | null | undefined) {
  return jid === 'status@broadcast';
}

export function isJidBroadcast(jid: string | null | undefined) {
  return typeof jid === 'string' && jid.endsWith('@broadcast');
}

export function isJidMetaAI(jid: string | null | undefined) {
  return typeof jid === 'string' && jid.endsWith('@meta.ai');
}

export function isLidUser(jid: string | null | undefined) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

export function isNullJid(jid: string | null | undefined) {
  if (!jid) {
    return false;
  }
  return jid === '0@c.us' || jid === '0@s.whatsapp.net';
}

export function isPnUser(jid: string | null | undefined) {
  if (typeof jid !== 'string') {
    return false;
  }
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@c.us')) {
    return false;
  }
  if (isNullJid(jid)) {
    return false;
  }
  return true;
}

export function normalizeJid(jid: string): string {
  return jid.replace(/:\d+(?=@)/, '');
}

export function toJID(chatId: any) {
  if (isJidGroup(chatId)) {
    return chatId;
  }
  if (isJidBroadcast(chatId)) {
    return chatId;
  }
  if (isJidNewsletter(chatId)) {
    return chatId;
  }
  if (isLidUser(chatId)) {
    return chatId;
  }
  if (isJidMetaAI(chatId)) {
    return chatId;
  }
  const number = chatId.split('@')[0];
  return number + '@s.whatsapp.net';
}

export function toCusFormat(remoteJid: any) {
  if (!remoteJid) {
    return remoteJid;
  }
  if (isJidGroup(remoteJid)) {
    return remoteJid;
  }
  if (isJidBroadcast(remoteJid)) {
    return remoteJid;
  }
  if (isLidUser(remoteJid)) {
    return normalizeJid(remoteJid);
  }
  if (isJidNewsletter(remoteJid)) {
    return remoteJid;
  }
  if (remoteJid == 'me') {
    return remoteJid;
  }
  let number = remoteJid.split('@')[0];
  number = number.split(':')[0];
  return `${number}@c.us`;
}

export class IgnoreJidConfig {
  dm?: boolean;
  status!: boolean;
  groups!: boolean;
  channels!: boolean;
  broadcast!: boolean;
}

export class JidFilter {
  constructor(public ignore: IgnoreJidConfig) {}

  include(jid: string | null | undefined): boolean {
    if (this.ignore.status && isJidStatusBroadcast(jid)) {
      return false;
    } else if (
      this.ignore.broadcast &&
      !isJidStatusBroadcast(jid) &&
      isJidBroadcast(jid)
    ) {
      return false;
    } else if (this.ignore.groups && isJidGroup(jid)) {
      return false;
    } else if (this.ignore.channels && isJidNewsletter(jid)) {
      return false;
    } else if (this.ignore.dm && isLidUser(jid)) {
      return false;
    } else if (this.ignore.dm && isPnUser(jid)) {
      return false;
    }
    return true;
  }
}

export class Jids {
  lid?: string;
  pn?: string;
}

export function jidsFromKey(key: any): Jids | null {
  if (isLidUser(key.remoteJid)) {
    return {
      lid: key.remoteJid,
      pn: key.remoteJidAlt,
    };
  } else if (isPnUser(key.remoteJid)) {
    return {
      lid: key.remoteJidAlt,
      pn: key.remoteJid,
    };
  } else if (isLidUser(key.participant)) {
    return {
      lid: key.participant,
      pn: key.participantAlt,
    };
  } else if (isPnUser(key.participant)) {
    return {
      lid: key.remoteJid,
      pn: key.participantAlt,
    };
  }
  return null;
}

export function isJidUser(jid: string): boolean {
  return jid?.includes('@s.whatsapp.net') || false;
}

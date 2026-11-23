/**
 * Pure mapping helpers for the WEBJS engine.
 *
 * These used to live at the top of the 1,700-line session class. They depend on
 * no session state, so keeping them here makes the contract (and the
 * whatsapp-web.js → BunWa translation) directly testable and keeps the class
 * focused on lifecycle and protocol calls.
 */

import { BadRequestException } from '../../exceptions';
import { participantId } from '../../utils/jids';
import {
  GroupParticipant,
  GroupParticipantRole,
} from '../../../structures/groups.dto';

/** whatsapp-web.js message kind → the API's message type vocabulary. */
export function mapWwebjsMessageType(wwebjsType: string): string {
  const map: Record<string, string> = {
    chat: 'text',
    text: 'text',
    image: 'image',
    video: 'video',
    audio: 'audio',
    ptt: 'audio',
    document: 'document',
    sticker: 'sticker',
    location: 'location',
    contact_card: 'contact',
    contacts_vcard: 'contact',
    reaction: 'reaction',
  };
  return map[wwebjsType] || 'unknown';
}

/**
 * Resolve one entry of a participants payload into a whatsapp-web.js chat id.
 * The API contract is a list of chat ids (15551234567 or 15551234567@c.us);
 * objects carrying an `id` are accepted too, matching the BUNWEB engine. A
 * malformed entry is a bad request instead of an undefined participant.
 */
export function toWebjsParticipantId(participant: unknown): string {
  const id = participantId(participant);
  if (!id) {
    throw new BadRequestException(
      'Each group participant must be a chat id like 15551234567@c.us, or an object with an id field.',
    );
  }
  return id.includes('@') ? id : `${id}@c.us`;
}

/**
 * Map a whatsapp-web.js participant onto the API shape. The library reports
 * booleans (isAdmin, isSuperAdmin); the contract uses roles, matching the
 * BUNWEB engine and the documented GroupParticipant.
 */
export function toGroupParticipant(participant: any): GroupParticipant {
  return {
    id: participant?.id?._serialized ?? participant?.id,
    role: participant?.isSuperAdmin
      ? GroupParticipantRole.SUPERADMIN
      : participant?.isAdmin
        ? GroupParticipantRole.ADMIN
        : GroupParticipantRole.PARTICIPANT,
    username: participant?.username || undefined,
  };
}

/**
 * Chromium takes the proxy as `scheme://host:port` and authenticates through
 * `page.authenticate` (wwebjs `proxyAuthentication`). Credentials embedded in
 * the server URL are split out so the flag stays a valid proxy endpoint and
 * the username/password actually reach Chromium — BUNWEB embeds them in its
 * agent URL, and both engines must honour the same ProxyConfig.
 */
export function splitProxyConfig(config: {
  server: string;
  username?: string;
  password?: string;
}): {
  server: string;
  authentication?: { username: string; password: string };
} {
  let username = config.username;
  let password = config.password;
  let server = config.server;
  try {
    const url = new URL(config.server);
    if (!username && url.username) username = decodeURIComponent(url.username);
    if (!password && url.password) password = decodeURIComponent(url.password);
    url.username = '';
    url.password = '';
    server = url.toString();
  } catch {
    // Not a parseable URL — pass it through unchanged.
  }
  return {
    server,
    authentication: username && password ? { username, password } : undefined,
  };
}

/** WhatsApp shows pairing codes as ABCD-EFGH; keep one presentation per engine. */
export function formatPairingCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

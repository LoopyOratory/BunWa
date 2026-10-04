/**
 * Engine-neutral WhatsApp identity handling.
 *
 * WhatsApp addresses the same entity through several dialects:
 *   - `<phone>@c.us`           a user, addressed by phone (whatsapp-web.js dialect)
 *   - `<phone>@s.whatsapp.net`  the SAME user, in the raw protocol dialect (Baileys)
 *   - `<lid>@lid`               a user addressed by a privacy id (LID); the number is NOT a phone
 *   - `<id>@g.us`               a group
 *   - `status@broadcast`        the status/stories pseudo-JID
 *   - `<id>@newsletter`         a channel; `<id>@broadcast` a broadcast list
 *   - `handle`, `@handle` or `handle@username`  a user addressed by WhatsApp username
 *   - any of the above may carry a `:<device>` multi-device suffix
 *
 * The engine boundary is an anti-corruption layer: adapters reduce all of that to the NEUTRAL dialect
 * the application layer sees, so app code never has to know which engine produced an id. The neutral
 * dialect is intentionally small:
 *   - `<phone>@c.us`  a user known by phone        (the common case; @s.whatsapp.net folds into this)
 *   - `<id>@g.us`     a group
 *   - `<lid>@lid`     a user known ONLY by privacy id - phone genuinely unknown (a first-class state)
 *   - `status@broadcast` / `<id>@newsletter` / `<id>@broadcast`  special channels
 *   - never `@s.whatsapp.net`, never a `:device` suffix
 *
 * A username is recognized here and classified, but it has NO neutral JID: the protocol maps it to
 * the user's LID, not to a separate address form, so `toNeutralJid` passes it through untouched and
 * callers that need an address must resolve it (see the send-target resolution in the engine).
 *
 * Resolution rule: prefer `@c.us` (resolve a lid to its phone when the mapping is known); fall back to
 * `@lid` only when it can't be resolved. An unresolved lid is NOT pretended to be a phone.
 */

export type WaIdKind =
  | 'user'
  | 'group'
  | 'lid'
  | 'status'
  | 'newsletter'
  | 'broadcast'
  | 'username'
  | 'unknown';

/** Domains that denote a phone-addressed user (the two are the same entity, different dialects). */
const USER_DOMAINS = new Set(['c.us', 's.whatsapp.net']);

/** The dialect domain WhatsApp clients use for a username-addressed JID (`handle@username`). */
export const USERNAME_DOMAIN = 'username';

export interface ParsedWaId {
  kind: WaIdKind;
  /** The local part with the device suffix and domain stripped (phone digits, lid number, or group id). */
  userPart: string;
  /** The multi-device suffix (`:N`), when present. */
  device?: string;
  /** The original JID, verbatim. */
  raw: string;
}

/** The local part of a JID: domain and `:device` suffix stripped (`628:12@s.whatsapp.net` -> `628`). */
export function userPart(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

/** A bare handle that does not look like a phone number (digits only, optional leading +). */
function looksLikeBareHandle(value: string): boolean {
  return value.length > 0 && !/^\+?\d+$/.test(value);
}

/** Classify any WhatsApp JID into its neutral kind + parts, without resolving anything. */
export function parseWaId(jid: string): ParsedWaId {
  const raw = jid;
  const lower = jid.trim().toLowerCase();
  if (lower === 'status@broadcast') {
    return { kind: 'status', userPart: 'status', raw };
  }
  // `@handle` (the Telegram-style spelling) and a bare non-numeric handle.
  if (lower.startsWith('@') && !lower.slice(1).includes('@')) {
    return { kind: 'username', userPart: lower.slice(1), raw };
  }
  const at = lower.lastIndexOf('@');
  if (at === -1) {
    return looksLikeBareHandle(lower)
      ? { kind: 'username', userPart: lower, raw }
      : { kind: 'unknown', userPart: lower, raw };
  }
  const domain = lower.slice(at + 1);
  const [local, device] = lower.slice(0, at).split(':');
  const kind: WaIdKind = USER_DOMAINS.has(domain)
    ? 'user'
    : domain === 'g.us'
      ? 'group'
      : domain === 'lid'
        ? 'lid'
        : domain === 'newsletter'
          ? 'newsletter'
          : domain === 'broadcast'
            ? 'broadcast'
            : domain === USERNAME_DOMAIN
              ? 'username'
              : 'unknown';
  return { kind, userPart: local, device, raw };
}

/**
 * The bare handle from any accepted username address form (`handle`, `@handle`,
 * `handle@username`), lowercased. Non-username input is returned verbatim, so
 * callers can use this blindly before validation.
 */
export function usernameHandle(value: string): string {
  const parsed = parseWaId(value);
  return parsed.kind === 'username' ? parsed.userPart : value.trim();
}

/** Check whether the value is an address form that denotes a username. */
export function isUsernameAddress(value: string): boolean {
  return parseWaId(value).kind === 'username';
}

/**
 * Meta's published rules for user and business usernames: 3 to 35 characters
 * from a-z, 0-9, period and underscore, at least one letter, no leading or
 * trailing period, no consecutive periods, no `www` prefix, and no domain-like
 * ending. Comparison is case-insensitive.
 *
 * The domain-ending rule in Meta's documentation is open-ended ("and so on");
 * only the examples it lists are rejected here.
 */
const DOMAIN_LIKE_ENDINGS = new Set(['com', 'org', 'net', 'int', 'edu', 'gov', 'mil', 'us', 'in', 'html']);

export function isValidWhatsAppUsername(value: string): boolean {
  const handle = usernameHandle(value).toLowerCase();
  if (handle.length < 3 || handle.length > 35) {
    return false;
  }
  if (!/^[a-z0-9._]+$/.test(handle)) {
    return false;
  }
  if (!/[a-z]/.test(handle)) {
    return false;
  }
  if (handle.startsWith('.') || handle.endsWith('.') || handle.includes('..')) {
    return false;
  }
  if (handle.startsWith('www')) {
    return false;
  }
  const lastDot = handle.lastIndexOf('.');
  return lastDot === -1 || !DOMAIN_LIKE_ENDINGS.has(handle.slice(lastDot + 1));
}

/**
 * Reduce any WhatsApp JID to the neutral dialect (see the module contract above). `resolvePhone` maps a
 * lid to its phone user-part when the engine knows the mapping; an unresolvable lid is kept as
 * `<lid>@lid`. Idempotent on an already-neutral id. An unrecognized format is passed through unchanged.
 */
export function toNeutralJid(jid: string, resolvePhone?: (jid: string) => string | null): string {
  if (!jid) {
    return jid;
  }
  const parsed = parseWaId(jid);
  switch (parsed.kind) {
    case 'user':
      return `${parsed.userPart}@c.us`;
    case 'group':
      return `${parsed.userPart}@g.us`;
    case 'lid': {
      const phone = resolvePhone?.(jid);
      return phone ? `${phone}@c.us` : `${parsed.userPart}@lid`;
    }
    case 'status':
      return 'status@broadcast';
    case 'newsletter':
      return `${parsed.userPart}@newsletter`;
    case 'broadcast':
      return `${parsed.userPart}@broadcast`;
    case 'username':
      // A username has no neutral JID (it maps to the user's LID on the wire);
      // pass it through so a resolver, not this reducer, decides the address.
      return parsed.raw;
    default:
      return jid;
  }
}

/** Check if a JID is a user (phone-addressed or LID). */
export function isUserJid(jid: string): boolean {
  return parseWaId(jid).kind === 'user';
}

/** Check if a JID is a group. */
export function isGroupJid(jid: string): boolean {
  return parseWaId(jid).kind === 'group';
}

/** Check if a JID is a LID (privacy-id only, no phone). */
export function isLidJid(jid: string): boolean {
  return parseWaId(jid).kind === 'lid';
}

/** Get the phone number from a user JID, or null if it's a LID or unknown. */
export function getPhoneFromJid(jid: string): string | null {
  const parsed = parseWaId(jid);
  if (parsed.kind === 'user') return parsed.userPart;
  return null;
}

/** Build a user JID from a phone number. Idempotent. */
export function phoneToJid(phone: string): string {
  if (phone.includes('@')) return phone;
  return `${phone}@c.us`;
}

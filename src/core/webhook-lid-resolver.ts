import type { LidResolver, WebhookFilters } from '../common/security/webhook-filters';

/** Fields of a message payload that may hold a person's or chat's JID. */
const ID_FIELDS = ['author', 'participant', 'from', 'to'] as const;
/** Filter fields compared as JIDs, the only ones that need a LID resolved. */
const ID_FILTERS = new Set(['sender', 'recipient', 'mentions']);

const digits = (jid: string | null | undefined): string | null => {
  const user = jid?.split('@')[0]?.split(':')[0];
  return user && /^\d+$/.test(user) ? user : null;
};

/**
 * WhatsApp increasingly addresses people by a private LID (123…@lid) instead
 * of their number, so a Sender filter of "233553919737" never matched them.
 * This maps every LID in a message to a phone number before the filters run:
 * first from the phone the message key itself carries (remoteJidAlt /
 * participantAlt), then from the session's LID store.
 *
 * Returns undefined when no filter compares JIDs, so ordinary deliveries pay
 * nothing.
 */
export async function buildLidResolver(
  filters: WebhookFilters | null | undefined,
  data: any,
  findPNByLid?: (lid: string) => Promise<{ pn?: string | null }>,
): Promise<LidResolver | undefined> {
  if (!filters?.conditions?.some((c) => ID_FILTERS.has(c.field)) || !data || typeof data !== 'object') {
    return undefined;
  }
  const phones = new Map<string, string>();

  // The key often carries both addresses: remoteJid + remoteJidAlt, participant + participantAlt.
  const key = data._data?.key;
  if (key) {
    for (const [lid, alt] of [
      [key.remoteJid, key.remoteJidAlt],
      [key.participant, key.participantAlt],
      [key.remoteJidAlt, key.remoteJid],
      [key.participantAlt, key.participant],
    ] as const) {
      const pn = digits(alt);
      if (typeof lid === 'string' && lid.endsWith('@lid') && pn && typeof alt === 'string' && !alt.endsWith('@lid')) {
        phones.set(lid, pn);
      }
    }
  }

  const lids = new Set<string>();
  for (const field of ID_FIELDS) {
    const value = data[field];
    if (typeof value === 'string' && value.endsWith('@lid')) lids.add(value);
  }
  if (Array.isArray(data.mentionedIds)) {
    for (const value of data.mentionedIds) {
      if (typeof value === 'string' && value.endsWith('@lid')) lids.add(value);
    }
  }

  if (findPNByLid) {
    await Promise.all(
      [...lids]
        .filter((lid) => !phones.has(lid))
        .map(async (lid) => {
          try {
            const pn = digits((await findPNByLid(lid))?.pn);
            if (pn) phones.set(lid, pn);
          } catch {
            // Unknown LID or an engine without a store: leave it unresolved.
          }
        }),
    );
  }

  return phones.size ? (jid: string) => phones.get(jid) ?? null : undefined;
}

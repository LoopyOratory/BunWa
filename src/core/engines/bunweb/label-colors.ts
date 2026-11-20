/**
 * WhatsApp's 20 predefined label colors, indexed by the 0-19 `LabelColor` id
 * Baileys sends on the wire (`LabelActionBody.color`).
 *
 * The hex list is verified against two independent sources: WhatsApp Web's own
 * label patch code (whatsapp-web.js issue #2992) and WAHA's documented pair
 * `color: 1 == colorHex: #64c4ff`. WhatsApp can change this mapping, so the
 * numeric color stays the stable identifier and the hex is presentation.
 */

export const WHATSAPP_LABEL_COLORS: readonly string[] = [
  '#ff9485', // 0
  '#64c4ff', // 1
  '#ffd429', // 2
  '#dfaef0', // 3
  '#99b6c1', // 4
  '#55ccb3', // 5
  '#ff9dff', // 6
  '#d3a91d', // 7
  '#6d7cce', // 8
  '#d7e752', // 9
  '#00d0e2', // 10
  '#ffc5c7', // 11
  '#93ceac', // 12
  '#f74848', // 13
  '#00a0f2', // 14
  '#83e422', // 15
  '#ffaf04', // 16
  '#b5ebff', // 17
  '#9ba6ff', // 18
  '#9368cf', // 19
];

function rgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** The palette hex for a 0-19 label color id, or undefined when out of range. */
export function hexFromLabelColor(color: number): string | undefined {
  const index = Math.trunc(color);
  if (!Number.isFinite(index) || index < 0 || index >= WHATSAPP_LABEL_COLORS.length) {
    return undefined;
  }
  return WHATSAPP_LABEL_COLORS[index];
}

/**
 * The 0-19 label color id to put on the wire for a caller-supplied color.
 * Numbers pass through (clamped to the palette range). Hex strings map to the
 * nearest palette entry by RGB distance, because WhatsApp only accepts the 20
 * predefined colors; anything unparseable falls back to the first color.
 */
export function labelColorFromHex(color: string | number | undefined | null): number {
  if (typeof color === 'number' && Number.isFinite(color)) {
    return Math.max(0, Math.min(WHATSAPP_LABEL_COLORS.length - 1, Math.trunc(color)));
  }
  if (typeof color === 'string') {
    const target = rgb(color);
    if (!target) return 0;
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < WHATSAPP_LABEL_COLORS.length; index++) {
      const candidate = rgb(WHATSAPP_LABEL_COLORS[index])!;
      const distance =
        (candidate[0] - target[0]) ** 2 +
        (candidate[1] - target[1]) ** 2 +
        (candidate[2] - target[2]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }
  return 0;
}

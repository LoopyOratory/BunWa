import { describe, expect, test } from 'bun:test';
import {
  WHATSAPP_LABEL_COLORS,
  hexFromLabelColor,
  labelColorFromHex,
} from '../core/engines/bunweb/label-colors';

describe('WhatsApp label colors', () => {
  test('has all 20 predefined colors, lowercase hex', () => {
    expect(WHATSAPP_LABEL_COLORS).toHaveLength(20);
    for (const hex of WHATSAPP_LABEL_COLORS) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('matches the WAHA-documented pair: color 1 is #64c4ff', () => {
    expect(hexFromLabelColor(1)).toBe('#64c4ff');
  });

  test('hex strings map to the exact palette entry', () => {
    for (let index = 0; index < WHATSAPP_LABEL_COLORS.length; index++) {
      expect(labelColorFromHex(WHATSAPP_LABEL_COLORS[index])).toBe(index);
    }
  });

  test('hex strings without a hash still map exactly', () => {
    expect(labelColorFromHex('64C4FF')).toBe(1);
  });

  test('off-palette hex maps to the nearest color by RGB distance', () => {
    // Between #64c4ff (1) and #00d0e2 (10), much closer to the former.
    expect(labelColorFromHex('#70c0f0')).toBe(1);
    // Between #f74848 (13) and #ffaf04 (16), clearly the former.
    expect(labelColorFromHex('#f05040')).toBe(13);
  });

  test('numbers pass through, clamped to the palette range', () => {
    expect(labelColorFromHex(0)).toBe(0);
    expect(labelColorFromHex(19)).toBe(19);
    expect(labelColorFromHex(25)).toBe(19);
    expect(labelColorFromHex(-3)).toBe(0);
  });

  test('unparseable input falls back to the first color', () => {
    expect(labelColorFromHex('not-a-color')).toBe(0);
    expect(labelColorFromHex(undefined)).toBe(0);
    expect(labelColorFromHex(null)).toBe(0);
  });

  test('hexFromLabelColor is undefined outside the palette range', () => {
    expect(hexFromLabelColor(20)).toBeUndefined();
    expect(hexFromLabelColor(-1)).toBeUndefined();
    expect(hexFromLabelColor(Number.NaN)).toBeUndefined();
  });

  test('round-trips: hex -> id -> hex is the identity on palette entries', () => {
    for (const hex of WHATSAPP_LABEL_COLORS) {
      expect(hexFromLabelColor(labelColorFromHex(hex))).toBe(hex);
    }
  });
});

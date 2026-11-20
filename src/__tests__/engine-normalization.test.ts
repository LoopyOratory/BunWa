import { describe, expect, test } from 'bun:test';
import { BUNWAEngine, normalizeBunwaEngine } from '../structures/enums.dto';

describe('engine name normalization (NOWEB -> BUNWEB rename)', () => {
  test('maps the legacy NOWEB spelling to BUNWEB', () => {
    expect(normalizeBunwaEngine('NOWEB')).toBe(BUNWAEngine.BUNWEB);
    expect(normalizeBunwaEngine('noweb')).toBe(BUNWAEngine.BUNWEB);
  });

  test('passes canonical spellings through', () => {
    expect(normalizeBunwaEngine('BUNWEB')).toBe(BUNWAEngine.BUNWEB);
    expect(normalizeBunwaEngine('WEBJS')).toBe(BUNWAEngine.WEBJS);
    expect(normalizeBunwaEngine('WPP')).toBe(BUNWAEngine.WPP);
    expect(normalizeBunwaEngine('GOWS')).toBe(BUNWAEngine.GOWS);
  });

  test('defaults to BUNWEB for unknown or missing input', () => {
    expect(normalizeBunwaEngine(undefined)).toBe(BUNWAEngine.BUNWEB);
    expect(normalizeBunwaEngine(null)).toBe(BUNWAEngine.BUNWEB);
    expect(normalizeBunwaEngine('')).toBe(BUNWAEngine.BUNWEB);
    expect(normalizeBunwaEngine('mystery')).toBe(BUNWAEngine.BUNWEB);
  });

  test('keeps the legacy enum member only as an alias, never a new value', () => {
    expect(BUNWAEngine.NOWEB).toBe('NOWEB');
    expect(BUNWAEngine.BUNWEB).toBe('BUNWEB');
    expect(new Set(Object.values(BUNWAEngine)).has('BUNWEB')).toBe(true);
  });
});

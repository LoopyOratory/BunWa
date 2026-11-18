import { describe, expect, test } from 'bun:test';
import { parseExtractedFacts } from '../core/agent/profile-extractor';

describe('profile fact extraction parser', () => {
  test('accepts a JSON array wrapped in prose', () => {
    const facts = parseExtractedFacts(
      'Here you go:\n[{"kind":"preference","key":"tone","value":"concise","confidence":0.9,"evidence":"asked for short replies","sensitivity":"normal"}]',
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: 'preference', key: 'tone', value: 'concise', confidence: 0.9 });
  });

  test('drops invalid entries and clamps confidence', () => {
    const facts = parseExtractedFacts(
      JSON.stringify([
        { kind: 'goal', key: 'renewal', value: 'renew before December', confidence: 2, sensitivity: 'sensitive' },
        { kind: 'nonsense', key: '', value: 'x', confidence: 0.5 },
        { kind: 'communication', key: 'channel', value: 'voice notes', confidence: -1 },
      ]),
    );
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ kind: 'goal', key: 'renewal', confidence: 1, sensitivity: 'sensitive' });
    expect(facts[1]).toMatchObject({ kind: 'communication', key: 'channel', confidence: 0 });
  });

  test('returns an empty list for non-JSON output', () => {
    expect(parseExtractedFacts('I could not find any facts.')).toEqual([]);
  });
});

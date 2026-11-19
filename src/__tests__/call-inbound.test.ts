import { describe, expect, test } from 'bun:test';
import { callRuntimeScript } from '../../scripts/call-inbound-live';

describe('inbound call runtime selection', () => {
  test('defaults to the Fish Audio bridge', () => {
    expect(callRuntimeScript('fish')).toEqual({
      provider: 'fish',
      script: 'scripts/fish-bridge.ts',
      label: 'Fish Audio',
    });
  });

  test('selects Gemini Live when asked', () => {
    expect(callRuntimeScript('gemini')).toEqual({
      provider: 'gemini',
      script: 'scripts/call-live.ts',
      label: 'Gemini Live',
    });
  });

  test('treats an unknown provider as Fish', () => {
    expect(callRuntimeScript('elevenlabs').provider).toBe('fish');
  });
});

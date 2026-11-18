import { describe, it, expect } from 'bun:test';
import { SSEDecoder, pcmToWav, EnergyVAD } from '../../scripts/call-agent';

describe('call agent helpers', () => {
  it('decodes SSE events split across chunks', () => {
    const decoder = new SSEDecoder();
    expect(decoder.feed('event: audio\ndata: {"a":')).toEqual([]);
    const events = decoder.feed('1}\n\nevent: audio\ndata: {"a":2}\n\n');
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'audio', data: '{"a":1}' });
    expect(events[1].data).toBe('{"a":2}');
  });

  it('wraps PCM in a valid WAV header', () => {
    const pcm = Buffer.alloc(320);
    const wav = pcmToWav(pcm, 16_000, 1);
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt32LE(40)).toBe(320);
    expect(wav.length).toBe(44 + 320);
  });

  it('emits an utterance after speech followed by silence', () => {
    const vad = new EnergyVAD(500, 16_000, 2, 5);
    const frame = (amplitude: number) => {
      const buf = Buffer.alloc(640);
      for (let i = 0; i < 320; i++) buf.writeInt16LE(Math.round(Math.sin(i / 3) * amplitude), i * 2);
      return buf;
    };

    let utterances: Buffer[] = [];
    for (let i = 0; i < 5; i++) utterances = utterances.concat(vad.push(frame(0)));
    for (let i = 0; i < 20; i++) utterances = utterances.concat(vad.push(frame(4000)));
    for (let i = 0; i < 10; i++) utterances = utterances.concat(vad.push(frame(0)));

    expect(utterances.length).toBe(1);
    expect(utterances[0].length).toBeGreaterThan(20 * 640);
  });
});

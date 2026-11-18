import { describe, expect, test } from 'bun:test';
import { SinkWriter, StreamingResampler, decodeSseLine, resamplePcm16 } from '../../scripts/call-live';

function sine(seconds: number, rate: number, amplitude = 8000): Buffer {
  const samples = Math.floor(rate * seconds);
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  }
  return buffer;
}

describe('call-live helpers', () => {
  test('passes PCM through unchanged at the same rate', () => {
    const input = sine(0.05, 16_000);
    expect(resamplePcm16(input, 16_000, 16_000)).toBe(input);
  });

  test('downsamples 24 kHz model audio to the 16 kHz call rate', () => {
    const input = sine(0.1, 24_000);
    const output = resamplePcm16(input, 24_000, 16_000);
    expect(input.length / 2).toBe(2400);
    // 100 ms at 16 kHz, allow one sample of rounding.
    expect(Math.abs(output.length / 2 - 1600)).toBeLessThanOrEqual(1);
  });

  test('upsamples 8 kHz audio to 16 kHz without changing duration', () => {
    const output = resamplePcm16(sine(0.1, 8_000), 8_000, 16_000);
    expect(Math.abs(output.length / 2 - 1600)).toBeLessThanOrEqual(1);
  });

  test('keeps the signal inside int16 range', () => {
    const input = Buffer.from([0x00, 0x80, 0xff, 0x7f, 0x00, 0x80]);
    const output = resamplePcm16(input, 48_000, 16_000);
    for (let i = 0; i < output.length / 2; i++) {
      const value = output.readInt16LE(i * 2);
      expect(value).toBeGreaterThanOrEqual(-32768);
      expect(value).toBeLessThanOrEqual(32767);
    }
  });

  test('returns an empty buffer for empty input', () => {
    expect(resamplePcm16(Buffer.alloc(0), 24_000, 16_000).length).toBe(0);
  });

  test('streaming resampler keeps chunk boundaries continuous', () => {
    const input = sine(1, 24_000, 12_000);
    const resampler = new StreamingResampler(24_000, 16_000);
    const chunks: Buffer[] = [];
    // Deliberately unaligned chunk sizes (1000 samples is not a multiple of 3).
    for (let offset = 0; offset < input.length; offset += 2000) {
      chunks.push(resampler.push(input.subarray(offset, Math.min(offset + 2000, input.length))));
    }
    const output = Buffer.concat(chunks);
    expect(Math.abs(output.length / 2 - 16_000)).toBeLessThanOrEqual(2);
    let maxDelta = 0;
    for (let i = 1; i < output.length / 2; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(output.readInt16LE(i * 2) - output.readInt16LE((i - 1) * 2)));
    }
    // A 440 Hz sine at 16 kHz moves at most ~1,400 counts between samples at
    // this amplitude; a phase reset at a chunk boundary would jump much more.
    expect(maxDelta).toBeLessThan(3_000);
  });

  test('streaming resampler passes 16 kHz input through untouched', () => {
    const input = sine(0.05, 16_000);
    const resampler = new StreamingResampler(16_000, 16_000);
    expect(resampler.push(input)).toBe(input);
  });

  test('decodes SSE data lines and ignores comments', () => {
    expect(decodeSseLine('data: {"data":"AAA"}')).toEqual({ data: '{"data":"AAA"}' });
    expect(decodeSseLine(': keep-alive')).toBeNull();
  });

  test('sink writer accepts PCM without a sink reachable', async () => {
    // A writer pointed at a missing sink must fail quietly rather than throw
    // from the write path, so a dead PulseAudio server cannot kill the call.
    const writer = new SinkWriter('bunwa_missing_sink', 16_000, 0);
    await writer.write(Buffer.alloc(640));
    await writer.close();
    expect(true).toBe(true);
  });
});

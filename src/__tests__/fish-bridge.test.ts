import { describe, expect, test } from 'bun:test';
import { Upsampler } from '../../scripts/fish-bridge';

function sine(seconds: number, rate: number, amplitude = 8000): Buffer {
  const samples = Math.floor(rate * seconds);
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(amplitude * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  }
  return buffer;
}

function frequency(buffer: Buffer, rate: number): number {
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
  let crossings = 0;
  let previous = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const current = samples[i];
    if ((previous < 0 && current >= 0) || (previous >= 0 && current < 0)) crossings += 1;
    previous = current;
  }
  return crossings / 2 / (samples.length / rate);
}

describe('Fish bridge upsampler', () => {
  test('upsamples 16 kHz caller audio to 48 kHz without speeding it up', () => {
    const input = sine(1, 16_000);
    const output = new Upsampler().push(input);

    // 1 s at 16 kHz should become 1 s at 48 kHz.
    expect(Math.abs(output.length / 2 - 48_000)).toBeLessThanOrEqual(5);

    // The 440 Hz tone must stay at 440 Hz. The inverted ratio used to turn
    // this into a ~4 kHz chirp, which made Fish unable to understand callers.
    expect(Math.abs(frequency(output, 48_000) - 440)).toBeLessThan(5);
  });
});

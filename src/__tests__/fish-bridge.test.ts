import { describe, expect, test } from 'bun:test';
import { Pcm48Framer, Upsampler } from '../../scripts/fish-bridge';

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

  test('passes 48 kHz caller audio through at the same duration and pitch', () => {
    const output = new Upsampler(48_000).push(sine(1, 48_000));
    expect(Math.abs(output.length / 2 - 48_000)).toBeLessThanOrEqual(5);
    expect(Math.abs(frequency(output, 48_000) - 440)).toBeLessThan(5);
  });
});

describe('Fish bridge PCM framer', () => {
  test('keeps the remainder instead of dropping it every burst', () => {
    const upsampler = new Upsampler();
    const framer = new Pcm48Framer();
    const input = sine(1, 16_000);
    let produced = 0;
    let framed = 0;

    // ScriptProcessor's 4096-sample bursts are the real-world shape.
    for (let offset = 0; offset < input.length; offset += 4096 * 2) {
      const pcm48 = upsampler.push(input.subarray(offset, offset + 4096 * 2));
      produced += pcm48.length;
      for (const frame of framer.push(pcm48)) framed += frame.length;
    }

    expect(framed + framer.bufferedBytes).toBe(produced);
    expect(framed / (960 * 2)).toBeGreaterThanOrEqual(49);
  });

  test('joins two 10 ms chunks into one 20 ms frame', () => {
    const framer = new Pcm48Framer();
    expect(framer.push(Buffer.alloc(480 * 2))).toHaveLength(0);
    expect(framer.bufferedBytes).toBe(960);
    expect(framer.push(Buffer.alloc(480 * 2))).toHaveLength(1);
    expect(framer.bufferedBytes).toBe(0);
  });
});

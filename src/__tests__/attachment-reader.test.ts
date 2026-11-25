import { afterEach, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { readAttachment } from '../core/agent/attachment-reader';
import type { VisionSettings } from '../core/agent/agent.types';

const originalFetch = globalThis.fetch;

function settings(overrides: Partial<VisionSettings> = {}): VisionSettings {
  return {
    provider: 'openai-compatible',
    baseUrl: 'https://vision.test/v1',
    apiKey: 'test-key',
    model: 'vision-model',
    fallbackProvider: 'openai-compatible',
    fallbackBaseUrl: '',
    fallbackApiKey: null,
    fallbackModel: '',
    ...overrides,
  };
}

async function png(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 24, height: 16, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('attachment reader', () => {
  test('extracts plain-text documents locally', async () => {
    const result = await readAttachment(
      {
        bytes: new TextEncoder().encode('Pickup is available on Saturdays.'),
        mimetype: 'text/plain',
        filename: 'pickup.txt',
      },
      { settings: settings() },
    );
    expect(result.kind).toBe('document');
    expect(result.text).toContain('Saturdays');
    expect(result.truncated).toBe(false);
  });

  test('describes an image with the OpenAI-compatible vision model', async () => {
    let captured: { url: string; body: any } | null = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body ?? '{}')) };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Receipt\nTotal: GHS 20.00' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await readAttachment(
      { bytes: await png(), mimetype: 'image/png', filename: 'receipt.png', caption: 'My order' },
      { settings: settings() },
    );

    expect(result.kind).toBe('image');
    expect(result.text).toContain('GHS 20.00');
    expect(result.image?.model).toBe('vision-model');
    expect(captured?.url).toBe('https://vision.test/v1/chat/completions');
    const content = captured?.body.messages[0].content as Array<{ type: string; image_url?: { url: string } }>;
    expect(content.some((part) => part.type === 'image_url' && part.image_url?.url.startsWith('data:image/jpeg;base64,'))).toBe(true);
    expect(JSON.stringify(captured?.body)).toContain('My order');
  });

  test('a reasoning model that answers in reasoning_content still yields text', async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'length',
              message: { content: '', reasoning_content: 'The photo shows a red dress with a GHC 250 price tag.' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await readAttachment(
      { bytes: await png(), mimetype: 'image/png', filename: 'dress.png' },
      { settings: settings() },
    );

    expect(result.kind).toBe('image');
    expect(result.text).toContain('GHC 250');
  });

  test('falls back to the fallback vision model when the primary fails', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return new Response('primary is down', { status: 503 });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'A white product label.' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await readAttachment(
      { bytes: await png(), mimetype: 'image/png', filename: 'label.png' },
      {
        settings: settings({
          fallbackBaseUrl: 'https://fallback.test/v1',
          fallbackApiKey: 'fallback-key',
          fallbackModel: 'fallback-vision',
        }),
      },
    );

    expect(result.text).toContain('product label');
    expect(result.image?.model).toBe('fallback-vision');
    expect(calls).toEqual([
      'https://vision.test/v1/chat/completions',
      'https://fallback.test/v1/chat/completions',
    ]);
  });

  test('rejects an unsupported file type with a plain message', async () => {
    await expect(
      readAttachment(
        { bytes: new Uint8Array([1, 2, 3]), mimetype: 'application/x-msdownload', filename: 'setup.exe' },
        { settings: settings() },
      ),
    ).rejects.toThrow(/Unsupported file type/);
  });
});

import 'reflect-metadata';
import { describe, expect, test } from 'bun:test';
import { transcribeAudio } from '../core/agent/stt';

// transcribeAudio logs through console.warn; silence it for test output.
const originalWarn = console.warn;
console.warn = () => {};

const AUDIO = Buffer.from('FAKE-OGG-BYTES');
const WAV = Buffer.concat([AUDIO, Buffer.from('-wav')]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * These tests must behave identically whether or not a real `stt` row exists
 * in the store: fetchImpl intercepts every /audio/transcriptions call, so the
 * primary leg is exercised through either the DB row or the env fallbacks.
 */
describe('stt fallback', () => {
  test('a failed primary falls back to Gemini inline audio and returns its transcript', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const calls: Array<{ url: string; body?: string }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url instanceof Request ? url.url : url);
      calls.push({ url: target, body: typeof init?.body === 'string' ? init.body : undefined });
      if (target.includes('/audio/transcriptions')) {
        return jsonResponse({ error: 'rate limited' }, 429);
      }
      return jsonResponse({ choices: [{ message: { content: '  Hello from the fallback  ' } }] });
    }) as unknown as typeof fetch;

    const transcript = await transcribeAudio(
      { bytes: AUDIO, mimetype: 'audio/ogg; codecs=opus' },
      { fetchImpl, toWav: async () => WAV },
    );

    expect(transcript).toBe('Hello from the fallback');
    const geminiCall = calls.find((c) => c.url.includes('generativelanguage'));
    expect(geminiCall).toBeDefined();
    const body = JSON.parse(geminiCall!.body!);
    expect(body.model).toBe('gemini-2.5-flash');
    const audioPart = body.messages[0].content.find((part: any) => part.type === 'input_audio');
    expect(audioPart.input_audio.format).toBe('wav');
    expect(audioPart.input_audio.data).toBe(WAV.toString('base64'));
  });

  test('a working primary result is returned without the fallback', async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url instanceof Request ? url.url : url);
      if (target.includes('/audio/transcriptions')) {
        return jsonResponse({ text: 'primary transcript' });
      }
      throw new Error('fallback should not be reached');
    }) as unknown as typeof fetch;

    const transcript = await transcribeAudio({ bytes: AUDIO, mimetype: 'audio/ogg' }, { fetchImpl });
    expect(transcript).toBe('primary transcript');
  });

  test('primary and fallback both failing returns null', async () => {
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    const fetchImpl = (async (url: string | URL | Request) => {
      const target = String(url instanceof Request ? url.url : url);
      if (target.includes('/audio/transcriptions')) return jsonResponse({}, 429);
      return jsonResponse({}, 503);
    }) as unknown as typeof fetch;

    const transcript = await transcribeAudio(
      { bytes: AUDIO, mimetype: 'audio/ogg' },
      { fetchImpl, toWav: async () => WAV },
    );
    expect(transcript).toBeNull();
  });
});

console.warn = originalWarn;

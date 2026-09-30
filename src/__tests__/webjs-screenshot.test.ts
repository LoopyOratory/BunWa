import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';

/**
 * Regression: getScreenshot() used to read `client.puppeteer.page`, an API that
 * whatsapp-web.js dropped (>= 1.31 exposes `pupPage`), so every screenshot
 * request failed with "Browser page not available" no matter what. These tests
 * pin both accessors and the failure modes.
 */
function fakeEngine(client: unknown): any {
  const engine = Object.create(WhatsappSessionWebJs.prototype);
  engine.client = client;
  return engine;
}

describe('WEBJS getScreenshot', () => {
  it('uses pupPage (whatsapp-web.js >= 1.31 API)', async () => {
    let calls = 0;
    const page = {
      screenshot: async (opts: unknown) => {
        calls += 1;
        expect(opts).toEqual({ type: 'png' });
        return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      },
    };
    const buffer = await fakeEngine({ pupPage: page }).getScreenshot();
    expect(calls).toBe(1);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(4);
  });

  it('falls back to the legacy client.puppeteer.page accessor', async () => {
    let calls = 0;
    const page = {
      screenshot: async () => {
        calls += 1;
        return new Uint8Array([1, 2, 3]);
      },
    };
    const buffer = await fakeEngine({ puppeteer: { page } }).getScreenshot();
    expect(calls).toBe(1);
    expect(buffer.length).toBe(3);
  });

  it('prefers pupPage when both accessors exist', async () => {
    const calls: string[] = [];
    const engine = fakeEngine({
      pupPage: { screenshot: async () => { calls.push('pupPage'); return new Uint8Array([1]); } },
      puppeteer: { page: { screenshot: async () => { calls.push('legacy'); return new Uint8Array([2]); } } },
    });
    await engine.getScreenshot();
    expect(calls).toEqual(['pupPage']);
  });

  it('throws when no page is available', async () => {
    await expect(fakeEngine({}).getScreenshot()).rejects.toThrow('Browser page not available');
  });

  it('throws when the session is not started', async () => {
    await expect(fakeEngine(null).getScreenshot()).rejects.toThrow('Session is not started');
  });
});

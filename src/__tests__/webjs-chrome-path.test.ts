import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { getBrowserExecutablePath } from '../core/session/session.browser';

/**
 * Regression: the WEBJS pre-flight check used to ignore the env overrides —
 * it only probed four hardcoded system paths, so `start()` on a WEBJS session
 * threw "requires Chrome/Chromium" even when CHROME_PATH pointed at a working
 * binary. The engine read the env vars, the manager did not. Both now resolve
 * through this one function.
 */
describe('getBrowserExecutablePath', () => {
  const ENV_KEYS = ['CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH'];
  const original = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of ENV_KEYS) original.set(key, process.env[key]);
  });
  afterAll(() => {
    for (const key of ENV_KEYS) {
      const value = original.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('honours CHROME_PATH first', () => {
    process.env.CHROME_PATH = '/custom/chrome';
    process.env.PUPPETEER_EXECUTABLE_PATH = '/other/chrome';
    expect(getBrowserExecutablePath()).toBe('/custom/chrome');
  });

  it('falls back to PUPPETEER_EXECUTABLE_PATH', () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = '/other/chrome';
    expect(getBrowserExecutablePath()).toBe('/other/chrome');
  });

  it('returns a system path candidate when no override is set', () => {
    const resolved = getBrowserExecutablePath();
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBeGreaterThan(0);
  });
});

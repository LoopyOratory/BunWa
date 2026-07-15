import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// ----- Injectable mock state for ssrf-guard -----
let ssrfBlocked = false;
let redirectBlocked = false;
let mockFetchFn: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;
let lastInit: RequestInit | undefined;

class MockSsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

mock.module('../common/security/ssrf-guard', () => ({
  resolveAndPinFetch: mock(async (url: string, init?: RequestInit) => {
    lastInit = init;

    if (ssrfBlocked) {
      throw new MockSsrfBlockedError('Blocked internal address: 127.0.0.1');
    }

    if (mockFetchFn) {
      let currentUrl = url;
      for (let hop = 0; hop < 5; hop++) {
        const res = await mockFetchFn(currentUrl, init);

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) {
            throw new MockSsrfBlockedError('Redirect with no Location header');
          }

          const nextUrl = new URL(location, currentUrl).toString();

          if (redirectBlocked && (nextUrl.includes('127.0.0.1') || nextUrl.includes('192.168') || nextUrl.includes('internal'))) {
            throw new MockSsrfBlockedError(`Host ${new URL(nextUrl).hostname} resolves to a blocked internal address`);
          }

          currentUrl = nextUrl;
          continue;
        }

        return res;
      }

      throw new MockSsrfBlockedError('Max redirect hops exceeded');
    }

    return new Response('ok', { status: 200 });
  }),
  isSsrfProtectionEnabled: () => !ssrfBlocked,
  SsrfBlockedError: MockSsrfBlockedError,
}));

// ----- Test imports (after mock.module) -----
import { fetchBuffer } from '../utils/fetch';

describe('fetchBuffer', () => {
  beforeEach(() => {
    ssrfBlocked = false;
    redirectBlocked = false;
    mockFetchFn = null;
    lastInit = undefined;
  });

  afterEach(() => {
    mockFetchFn = null;
  });

  it('returns a Buffer on success', async () => {
    mockFetchFn = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });

    const buf = await fetchBuffer('https://example.com/file.bin');

    expect(buf).toBeInstanceOf(Buffer);
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it('throws on non-ok response', async () => {
    mockFetchFn = async () => new Response('nope', { status: 404, statusText: 'Not Found' });

    await expect(fetchBuffer('https://example.com/missing.bin')).rejects.toThrow('HTTP 404: Not Found');
  });

  it('rejects requests to blocked internal addresses (SSRF)', async () => {
    ssrfBlocked = true;

    await expect(fetchBuffer('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('Blocked internal address');
  });

  it('blocks redirects to internal addresses', async () => {
    redirectBlocked = true;
    let callIndex = 0;
    mockFetchFn = async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://192.168.1.1/secret' },
        });
      }
      return new Response('ok', { status: 200 });
    };

    await expect(fetchBuffer('https://example.com/redirect')).rejects.toThrow('blocked internal address');
  });

  it('sends a random User-Agent and disables TLS verification', async () => {
    mockFetchFn = async () => new Response('ok', { status: 200 });

    await fetchBuffer('https://example.com/file.bin');

    const headers = lastInit?.headers as Record<string, string>;
    expect(headers['User-Agent']).toBeTruthy();
    expect((lastInit as { tls?: { rejectUnauthorized: boolean } })?.tls?.rejectUnauthorized).toBe(false);
  });
});

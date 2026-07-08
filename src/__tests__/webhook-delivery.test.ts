import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// ----- Injectable mock state for ssrf-guard -----
let ssrfBlocked = false;
let redirectBlocked = false;
let mockFetchFn: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

class MockSsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

mock.module('../common/security/ssrf-guard', () => ({
  resolveAndPinFetch: mock(async (url: string, init?: RequestInit) => {
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
  isSsrfProtectionEnabled: () => ssrfBlocked,
  SsrfBlockedError: MockSsrfBlockedError,
  resolveSafeFetchTarget: mock(() => {
    if (ssrfBlocked) throw new MockSsrfBlockedError('Blocked');
    return Promise.resolve(null);
  }),
  safeFetch: mock(async (url: string, init?: RequestInit) => {
    if (ssrfBlocked) throw new MockSsrfBlockedError('Blocked');
    if (mockFetchFn) return mockFetchFn(url, init);
    return new Response('ok', { status: 200 });
  }),
}));

// ----- Test imports (after mock.module) -----
import { WebhookDelivery } from '../core/webhook-delivery';
import { WhatsappConfigService } from '../config.service';

const mockConfigService = {
  getWebhookUrl: () => 'https://example.com/webhook',
} as unknown as WhatsappConfigService;

describe('WebhookDelivery', () => {
  let delivery: WebhookDelivery;

  beforeEach(() => {
    ssrfBlocked = false;
    redirectBlocked = false;
    mockFetchFn = null;
    delivery = new WebhookDelivery(mockConfigService);
  });

  afterEach(() => {
    mockFetchFn = null;
  });

  const basePayload = {
    event: 'message',
    session: 'test-session',
    timestamp: Date.now(),
    data: { body: 'hello', type: 'text' },
  };

  // ===== Constructor =====
  it('creates an instance with config service', () => {
    expect(delivery).toBeInstanceOf(WebhookDelivery);
  });

  // ===== 1. Success =====
  it('succeeds on 200 response', async () => {
    mockFetchFn = async () => new Response('ok', { status: 200 });

    const result = await delivery.deliver(basePayload, { url: 'https://example.com/webhook' });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeUndefined();
  });

  // ===== 2. Non-2xx =====
  it('returns error on non-2xx response', async () => {
    mockFetchFn = async () => new Response('error', { status: 400 });

    const result = await delivery.deliver(basePayload, { url: 'https://example.com/webhook' });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.error).toBe('HTTP 400');
  });

  // ===== 3. SSRF blocked =====
  it('returns SSRF blocked error', async () => {
    ssrfBlocked = true;

    const result = await delivery.deliver(basePayload, { url: 'https://example.com/webhook' });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Blocked');
    expect(result.statusCode).toBeUndefined();
  });

  // ===== 4. Redirect to internal address blocked =====
  it('blocks redirect to internal address', async () => {
    redirectBlocked = true;
    let callIndex = 0;
    mockFetchFn = async (url: string) => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://192.168.1.1/secret' },
        });
      }
      return new Response('ok', { status: 200 });
    };

    const result = await delivery.deliver(basePayload, { url: 'https://example.com/redirect' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('blocked internal address');
  });

  // ===== 5. Redirect to public address allowed =====
  it('follows redirect to public address', async () => {
    redirectBlocked = false;
    let callIndex = 0;
    mockFetchFn = async (url: string) => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://public.example.com/final' },
        });
      }
      return new Response('ok', { status: 200 });
    };

    const result = await delivery.deliver(basePayload, { url: 'https://example.com/redirect' });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  // ===== 6. HMAC header =====
  it('sends HMAC signature when secret is configured', async () => {
    let sentHeaders: Record<string, string> = {};
    mockFetchFn = async (_url: string, init?: RequestInit) => {
      sentHeaders = (init?.headers as Record<string, string>) || {};
      return new Response('ok', { status: 200 });
    };

    await delivery.deliver(basePayload, {
      url: 'https://example.com/webhook',
      secret: 'my-secret',
    });

    const signature = sentHeaders['x-waha-signature'] || sentHeaders['X-WAHA-Signature'] || '';
    // HMAC-SHA256 hex output is 64 chars
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  // ===== 7. Filter skip =====
  it('skips delivery when filters do not match', async () => {
    let fetchCalled = false;
    mockFetchFn = async () => {
      fetchCalled = true;
      return new Response('ok', { status: 200 });
    };

    const result = await delivery.deliver(basePayload, {
      url: 'https://example.com/webhook',
      filters: { conditions: [{ field: 'type', operator: 'is', value: 'image' }] },
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBeUndefined();
    expect(fetchCalled).toBe(false);
  });

  // ===== 8. Filter match (delivers) =====
  it('delivers when filters match', async () => {
    let fetchCalled = false;
    mockFetchFn = async () => {
      fetchCalled = true;
      return new Response('ok', { status: 200 });
    };

    const result = await delivery.deliver(basePayload, {
      url: 'https://example.com/webhook',
      filters: { conditions: [{ field: 'type', operator: 'is', value: 'text' }] },
    });

    expect(result.ok).toBe(true);
    expect(fetchCalled).toBe(true);
  });

  // ===== 9. Retry on 500 then succeed =====
  it('retries on 500 and succeeds', async () => {
    let callCount = 0;
    mockFetchFn = async () => {
      callCount++;
      if (callCount === 1) return new Response('error', { status: 500 });
      return new Response('ok', { status: 200 });
    };

    const result = await delivery.deliver(basePayload, {
      url: 'https://example.com/webhook',
      retries: 3,
      retryDelayMs: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(callCount).toBe(2);
  });

  // ===== 10. 5xx with retries exhausted =====
  it('gives up after max retries on 5xx', async () => {
    let callCount = 0;
    mockFetchFn = async () => {
      callCount++;
      return new Response('error', { status: 500 });
    };

    const result = await delivery.deliver(basePayload, {
      url: 'https://example.com/webhook',
      retries: 2,
      retryDelayMs: 5,
    });

    // Initial attempt + 2 retries = 3
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe('HTTP 500');
    expect(callCount).toBe(3);
  });

  // ===== 11. No URL configured =====
  it('returns error when no URL is configured', async () => {
    const cfg = { getWebhookUrl: () => undefined } as unknown as WhatsappConfigService;
    const d = new WebhookDelivery(cfg);

    const result = await d.deliver(basePayload);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('No webhook URL configured');
  });

  // ===== 12. Custom headers =====
  it('sends custom headers when configured', async () => {
    let sentHeaders: Record<string, string> = {};
    mockFetchFn = async (_url: string, init?: RequestInit) => {
      sentHeaders = (init?.headers as Record<string, string>) || {};
      return new Response('ok', { status: 200 });
    };

    await delivery.deliver(basePayload, {
      url: 'https://example.com/webhook',
      customHeaders: { 'X-Custom': 'my-value' },
    });

    const found = sentHeaders['x-custom'] || sentHeaders['X-Custom'];
    expect(found).toBe('my-value');
  });
});

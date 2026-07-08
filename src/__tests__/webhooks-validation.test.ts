import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { WebhookCreateSchema, WebhookUpdateSchema } from '../structures/webhooks.config.dto';

describe('WebhookCreateSchema', () => {
  it('accepts valid webhook config', () => {
    const result = WebhookCreateSchema.parse({
      url: 'https://example.com/webhook',
      events: ['message', 'session.status'],
    });
    expect(result.url).toBe('https://example.com/webhook');
    expect(result.events).toEqual(['message', 'session.status']);
  });

  it('accepts optional fields', () => {
    const result = WebhookCreateSchema.parse({
      url: 'https://example.com/webhook',
      events: ['message'],
      enabled: false,
      hmac: { key: 'secret123' },
      retries: { attempts: 5, delaySeconds: 30 },
      customHeaders: [{ name: 'X-Custom', value: 'value1' }],
      filters: { conditions: [] },
    });
    expect(result.enabled).toBe(false);
    expect(result.hmac?.key).toBe('secret123');
    expect(result.retries?.attempts).toBe(5);
    expect(result.customHeaders).toHaveLength(1);
  });

  it('rejects invalid URL', () => {
    expect(() =>
      WebhookCreateSchema.parse({ url: 'not-a-url', events: ['message'] })
    ).toThrow();
  });

  it('rejects missing url', () => {
    expect(() =>
      WebhookCreateSchema.parse({ events: ['message'] })
    ).toThrow();
  });

  it('rejects missing events', () => {
    expect(() =>
      WebhookCreateSchema.parse({ url: 'https://example.com/webhook' })
    ).toThrow();
  });

  it('rejects events that are not strings', () => {
    expect(() =>
      WebhookCreateSchema.parse({ url: 'https://example.com/webhook', events: [123] })
    ).toThrow();
  });

  it('rejects hmac without key', () => {
    expect(() =>
      WebhookCreateSchema.parse({
        url: 'https://example.com/webhook',
        events: ['message'],
        hmac: { key: 123 },
      })
    ).toThrow();
  });

  it('rejects customHeaders without name or value', () => {
    expect(() =>
      WebhookCreateSchema.parse({
        url: 'https://example.com/webhook',
        events: ['message'],
        customHeaders: [{ name: 'X-Custom' }],
      })
    ).toThrow();
  });
});

describe('WebhookUpdateSchema', () => {
  it('accepts partial update with just url', () => {
    const result = WebhookUpdateSchema.parse({ url: 'https://new-url.com/webhook' });
    expect(result.url).toBe('https://new-url.com/webhook');
  });

  it('accepts partial update with just events', () => {
    const result = WebhookUpdateSchema.parse({ events: ['message'] });
    expect(result.events).toEqual(['message']);
  });

  it('accepts empty object (no fields to update)', () => {
    const result = WebhookUpdateSchema.parse({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('rejects invalid URL in update', () => {
    expect(() => WebhookUpdateSchema.parse({ url: 'bad' })).toThrow();
  });

  it('rejects non-array events', () => {
    expect(() => WebhookUpdateSchema.parse({ events: 'not-an-array' })).toThrow();
  });

  it('accepts full update with all fields', () => {
    const result = WebhookUpdateSchema.parse({
      url: 'https://example.com/webhook',
      events: ['message'],
      enabled: true,
      hmac: { key: 'new-secret' },
      retries: { attempts: 3, delaySeconds: 10 },
      customHeaders: [{ name: 'X-New', value: 'val' }],
      filters: { conditions: [{ field: 'type', operator: 'is', value: 'text' }] },
    });
    expect(result.enabled).toBe(true);
    expect(result.hmac?.key).toBe('new-secret');
    expect(result.customHeaders).toHaveLength(1);
  });
});

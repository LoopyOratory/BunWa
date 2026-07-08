import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createHmac } from 'crypto';
import type { ChatwootAppConfig } from '../apps/chatwoot/dto/chatwoot-config.dto';
import { ChatwootAppService } from '../apps/chatwoot/services/ChatwootAppService';

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function makeApp(overrides: Partial<ChatwootAppConfig> = {}): ChatwootAppConfig {
  return {
    id: 'app_test_123',
    session: 'test-session',
    app: 'chatwoot',
    enabled: true,
    config: {
      url: 'http://chatwoot:3000',
      accountId: 1,
      accountToken: 'tok_123',
      inboxId: 1,
      ...overrides.config,
    },
    ...overrides,
  };
}

describe('Chatwoot HMAC webhook verification', () => {
  let service: ChatwootAppService;

  beforeAll(() => {
    service = new ChatwootAppService();
  });

  it('rejects webhook when HMAC secret is configured but no signature header is provided', async () => {
    const app = makeApp({
      config: {
        url: 'http://chatwoot:3000',
        accountId: 1,
        accountToken: 'tok_123',
        inboxId: 1,
        webhookSecret: 'my-secret',
      },
    });
    const body = { event: 'message_created', account: { id: 1 } };
    const rawBody = JSON.stringify(body);

    const result = await service.verifyWebhookSignature(app, body, rawBody, '');
    expect(result).toBe(false);
  });

  it('rejects webhook when HMAC signature does not match', async () => {
    const app = makeApp({
      config: {
        url: 'http://chatwoot:3000',
        accountId: 1,
        accountToken: 'tok_123',
        inboxId: 1,
        webhookSecret: 'my-secret',
      },
    });
    const body = { event: 'message_created', account: { id: 1 } };
    const rawBody = JSON.stringify(body);
    const wrongSignature = '0000000000000000000000000000000000000000000000000000000000000000';

    const result = await service.verifyWebhookSignature(app, body, rawBody, wrongSignature);
    expect(result).toBe(false);
  });

  it('accepts webhook when HMAC signature is valid', async () => {
    const secret = 'my-secret';
    const app = makeApp({
      config: {
        url: 'http://chatwoot:3000',
        accountId: 1,
        accountToken: 'tok_123',
        inboxId: 1,
        webhookSecret: secret,
      },
    });
    const body = { event: 'message_created', account: { id: 1 } };
    const rawBody = JSON.stringify(body);
    const signature = signPayload(rawBody, secret);

    const result = await service.verifyWebhookSignature(app, body, rawBody, signature);
    expect(result).toBe(true);
  });

  it('falls back to legacy account_id check when no webhookSecret is configured', async () => {
    const app = makeApp({
      config: {
        url: 'http://chatwoot:3000',
        accountId: 1,
        accountToken: 'tok_123',
        inboxId: 1,
      },
    });
    const body = { event: 'message_created', account: { id: 1 } };

    const result = await service.verifyWebhookSignature(app, body);
    expect(result).toBe(true);
  });

  it('rejects webhook with mismatched account_id in legacy mode', async () => {
    const app = makeApp({
      config: {
        url: 'http://chatwoot:3000',
        accountId: 1,
        accountToken: 'tok_123',
        inboxId: 1,
      },
    });
    const body = { event: 'message_created', account: { id: 999 } };

    const result = await service.verifyWebhookSignature(app, body);
    expect(result).toBe(false);
  });
});

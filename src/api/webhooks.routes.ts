import { Hono } from 'hono';
import { container } from 'tsyringe';
import { ZodError } from 'zod';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { SessionManager } from '../core/manager.core';
import { WebhookDelivery } from '../core/webhook-delivery';
import { WhatsappConfigService } from '../config.service';
import { generatePrefixedId } from '../utils/ids';
import { WebhookCreateSchema, WebhookUpdateSchema } from '../structures/webhooks.config.dto';
import { AuditService, AuditAction } from '../core/audit/audit.service';

export function createWebhooksRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/sessions/:session/webhooks
  router.get('/:session/webhooks', async (c) => {
    const session = c.req.param('session');
    const manager = container.resolve(SessionManager);
    const config = manager.getSessionConfig(session);
    return c.json(config?.webhooks || []);
  });

  // POST /api/sessions/:session/webhooks
  router.post('/:session/webhooks', async (c) => {
    const session = c.req.param('session');
    const manager = container.resolve(SessionManager);
    const body = await c.req.json();

    let parsed;
    try {
      parsed = WebhookCreateSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ statusCode: 400, message: 'Validation failed', errors: err.issues }, 400);
      }
      throw err;
    }

    const config = manager.getSessionConfig(session) || {};
    const webhooks = config.webhooks || [];

    const webhook = {
      id: generatePrefixedId('wh'),
      enabled: parsed.enabled !== undefined ? parsed.enabled : true,
      url: parsed.url,
      events: parsed.events || [],
      hmac: parsed.hmac,
      retries: parsed.retries,
      customHeaders: parsed.customHeaders,
      filters: parsed.filters,
    };

    webhooks.push(webhook);
    config.webhooks = webhooks;
    await manager.upsert(session, config);
    await manager.resyncWebhooks(session);
    container.resolve(AuditService).logInfo(AuditAction.WEBHOOK_CREATED, {
      sessionName: session,
      metadata: { webhookId: webhook.id, url: webhook.url },
    });

    return c.json(webhook, 201);
  });

  // PUT /api/sessions/:session/webhooks/:id
  router.put('/:session/webhooks/:id', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const manager = container.resolve(SessionManager);
    const body = await c.req.json();

    let parsed;
    try {
      parsed = WebhookUpdateSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        return c.json({ statusCode: 400, message: 'Validation failed', errors: err.issues }, 400);
      }
      throw err;
    }

    const config = manager.getSessionConfig(session) || {};
    const webhooks = config.webhooks || [];
    const idx = webhooks.findIndex((w: any) => w.id === id);

    if (idx === -1) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    // Construct field-by-field (not spread) to control shape
    const existing = webhooks[idx];
    webhooks[idx] = {
      id,
      url: parsed.url ?? existing.url,
      events: parsed.events ?? existing.events,
      enabled: parsed.enabled !== undefined ? parsed.enabled : existing.enabled,
      hmac: parsed.hmac ?? existing.hmac,
      retries: parsed.retries ?? existing.retries,
      customHeaders: parsed.customHeaders ?? existing.customHeaders,
      filters: parsed.filters ?? existing.filters,
    };
    config.webhooks = webhooks;
    await manager.upsert(session, config);
    await manager.resyncWebhooks(session);

    return c.json(webhooks[idx]);
  });

  // DELETE /api/sessions/:session/webhooks/:id
  router.delete('/:session/webhooks/:id', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const manager = container.resolve(SessionManager);

    const config = manager.getSessionConfig(session) || {};
    const webhooks = config.webhooks || [];
    const filtered = webhooks.filter((w: any) => w.id !== id);

    if (filtered.length === webhooks.length) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    config.webhooks = filtered;
    await manager.upsert(session, config);
    await manager.resyncWebhooks(session);
    container.resolve(AuditService).logInfo(AuditAction.WEBHOOK_DELETED, {
      sessionName: session,
      metadata: { webhookId: id },
    });

    return c.json({ result: true });
  });

  // POST /api/sessions/:session/webhooks/:id/test
  router.post('/:session/webhooks/:id/test', async (c) => {
    const session = c.req.param('session');
    const id = c.req.param('id');
    const manager = container.resolve(SessionManager);

    const config = manager.getSessionConfig(session) || {};
    const webhooks = config.webhooks || [];
    const webhook = webhooks.find((w: any) => w.id === id);

    if (!webhook) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    if (!webhook.url) {
      return c.json({ error: 'Webhook has no URL configured' }, 400);
    }

    try {
      const deliveryConfig = {
        url: webhook.url,
        secret: webhook.hmac?.key,
        retries: 0,
        retryDelayMs: 0,
        customHeaders: webhook.customHeaders?.reduce((acc: Record<string, string>, h: any) => {
          acc[h.name] = h.value;
          return acc;
        }, {}),
        filters: webhook.filters,
      };

      const configService = container.resolve(WhatsappConfigService);
      const delivery = new WebhookDelivery(configService);

      const result = await delivery.deliver({
        event: 'webhook.test',
        session,
        timestamp: Date.now(),
        data: {
          message: 'This is a test webhook delivery',
          webhookId: id,
        },
      }, deliveryConfig);

      if (result.ok) {
        return c.json({ ok: true, statusCode: result.statusCode, sentAt: new Date().toISOString() }, 200);
      }
      return c.json({ ok: false, statusCode: result.statusCode, error: result.error }, 422);
    } catch (err: any) {
      return c.json({ ok: false, error: err.message || 'Test delivery failed' }, 422);
    }
  });

  return router;
}

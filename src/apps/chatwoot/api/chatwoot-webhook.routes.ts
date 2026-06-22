import { Hono } from 'hono';
import pino from 'pino';
import { ChatwootAppService } from '../services/ChatwootAppService';
import { ChatwootWebhookPayload } from '../dto/chatwoot-config.dto';

export function createChatwootWebhookRouter(appService: ChatwootAppService): Hono {
  const router = new Hono();
  const log = pino({ name: 'ChatwootWebhook' });

  // POST /webhook/chatwoot/:session — Chatwoot calls this on message events
  router.post('/:session', async (c) => {
    try {
      const session = c.req.param('session');
      const body: ChatwootWebhookPayload = await c.req.json();

      log.debug(
        { event: body.event, type: body.message_type, conversationId: body.conversation?.id },
        'Received Chatwoot webhook',
      );

      // Find the chatwoot app for this session
      const apps = await appService.listApps();
      const app = apps.find((a) => a.session === session && a.enabled);

      if (!app) {
        log.warn({ session }, 'No enabled Chatwoot app found for session — ignoring webhook');
        return c.json({ ok: false, message: 'No app configured for this session' }, 404);
      }

      // Verify the webhook is from the right account
      const verified = await appService.verifyWebhookSignature(app, body);
      if (!verified) {
        return c.json({ ok: false, message: 'Account mismatch' }, 403);
      }

      // Process the webhook asynchronously (don't block Chatwoot)
      appService.handleChatwootWebhook(app, body).catch((err) => {
        log.error({ err, conversationId: body.conversation?.id }, 'Error processing Chatwoot webhook');
      });

      return c.json({ ok: true });
    } catch (err: any) {
      log.error({ err: err.message }, 'Error handling Chatwoot webhook');
      return c.json({ ok: false, message: err.message }, 400);
    }
  });

  // GET /webhook/chatwoot — health check endpoint for Chatwoot
  router.get('/', (c) => {
    return c.json({ ok: true, app: 'chatwoot', version: '1.0.0' });
  });

  return router;
}

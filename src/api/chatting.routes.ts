import { Hono } from 'hono';
import { BulkMessageService } from '../core/bulk-message.service';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';
import { SessionManager } from '../core/manager.core';
import { getSessionFromBody } from '../middleware/get-session-from-body';
import { AuditService, AuditAction } from '../core/audit/audit.service';

// Get session name from body for policy enforcement
const FromBodySession = (c: any) => {
  const body = c.get('body');
  return body?.session;
};

/**
 * Runs a send-message action and records it to the audit log, without
 * changing the calling route's error handling — the underlying error is
 * always rethrown so existing try/catch-or-propagate behavior in each
 * handler is unaffected.
 */
async function sendAndAudit<T>(sessionName: string | undefined, action: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    container.resolve(AuditService).logInfo(AuditAction.MESSAGE_SENT, {
      sessionName,
      metadata: { action },
    });
    return result;
  } catch (error: any) {
    container.resolve(AuditService).logWarn(AuditAction.MESSAGE_FAILED, {
      sessionName,
      errorMessage: error?.message || String(error),
      metadata: { action },
    });
    throw error;
  }
}

export function createChattingRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();

  router.use('*', apiKeyAuthMiddleware());

  router.post('/sendText',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'sendText', () => (session as any).sendText({
        session: body.session,
        chatId: body.chatId,
        text: body.text,
        reply_to: body.reply_to,
      }));
      return c.json(result);
    }
  );

  router.post('/sendImage',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendImage', () => (session as any).sendImage({
          session: body.session,
          chatId: body.chatId,
          file: body.file,
          caption: body.caption,
        }));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/sendFile',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendFile', () => (session as any).sendFile({
          session: body.session,
          chatId: body.chatId,
          file: body.file,
          caption: body.caption,
        }));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/sendVoice',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendVoice', () => (session as any).sendVoice({
          session: body.session,
          chatId: body.chatId,
          file: body.file,
        }));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/sendVideo',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendVideo', () => (session as any).sendVideo?.({
          session: body.session,
          chatId: body.chatId,
          file: body.file,
          caption: body.caption,
        }));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/sendLocation',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'sendLocation', () => (session as any).sendLocation({
        session: body.session,
        chatId: body.chatId,
        latitude: body.latitude,
        longitude: body.longitude,
        title: body.title,
      }));
      return c.json(result);
    }
  );

  router.post('/sendPoll',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'sendPoll', () => (session as any).sendPoll({
        session: body.session,
        chatId: body.chatId,
        poll: body.poll,
      }));
      return c.json(result);
    }
  );

  router.post('/sendPollVote',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      return c.json({ result: true });
    }
  );

  router.post('/sendContactVcard',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'sendContactVcard', () => (session as any).sendContactVCard({
        session: body.session,
        chatId: body.chatId,
        contacts: body.contacts,
      }));
      return c.json(result);
    }
  );

  router.post('/sendLinkPreview',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'sendLinkPreview', () => (session as any).sendLinkPreview({
        session: body.session,
        chatId: body.chatId,
        url: body.url,
        title: body.title,
      }));
      return c.json(result);
    }
  );

  router.post('/send/link-custom-preview',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendLinkCustomPreview', () => (session as any).sendLinkCustomPreview?.({
          session: body.session,
          chatId: body.chatId,
          url: body.url,
          title: body.title,
          body: body.bodyText,
        }));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/sendButtons',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendButtons', () => (session as any).sendButtons({
          session: body.session,
          chatId: body.chatId,
          buttons: body.buttons,
          header: body.header,
          body: body.body,
          footer: body.footer,
        }));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/sendList',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        const result = await sendAndAudit(body.session, 'sendList', () => (session as any).sendList?.(body));
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/send/buttons/reply',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      return c.json({ result: true });
    }
  );

  router.post('/forwardMessage',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'forwardMessage', () => (session as any).forwardMessage({
        session: body.session,
        chatId: body.chatId,
        messageId: body.messageId,
      }));
      return c.json(result);
    }
  );

  router.post('/sendSeen',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      await (session as any).sendSeen({
        session: body.session,
        chatId: body.chatId,
      });
      return c.json({ result: true });
    }
  );

  router.post('/startTyping',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      await (session as any).startTyping({
        session: body.session,
        chatId: body.chatId,
      });
      return c.json({ result: true });
    }
  );

  router.post('/stopTyping',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      await (session as any).stopTyping({
        session: body.session,
        chatId: body.chatId,
      });
      return c.json({ result: true });
    }
  );

  router.put('/reaction',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        await sendAndAudit(body.session, 'reaction', () => (session as any).setReaction({
          session: body.session,
          chatId: body.chatId,
          messageId: body.messageId,
          reaction: body.reaction,
        }));
        return c.json({ result: true });
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.put('/star',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      try {
        await sendAndAudit(body.session, 'star', () => (session as any).setStar({
          session: body.session,
          chatId: body.chatId,
          messageId: body.messageId,
          star: body.star,
        }));
        return c.json({ result: true });
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/reply',
    policiesMiddleware(CanSession(Action.Send, FromBodySession)),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await sendAndAudit(body.session, 'reply', () => (session as any).reply({
        session: body.session,
        chatId: body.chatId,
        text: body.text,
        reply_to: body.messageId,
      }));
      return c.json(result);
    }
  );

  router.get('/checkNumberStatus',
    policiesMiddleware(CanSession(Action.Read, FromBodySession)),
    async (c) => {
      const sessionName = c.req.query('session');
      const phone = c.req.query('phone');
      if (!sessionName || !phone) {
        return c.json({ statusCode: 400, message: 'session and phone query params required' }, 400);
      }
      const manager = container.resolve(SessionManager);
      try {
        const session = manager.getSession(sessionName);
        const result = await (session as any).checkNumberStatus({ phone });
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.get('/messages',
    policiesMiddleware(CanSession(Action.Read, FromBodySession)),
    (c) => {
      return c.json([]);
    }
  );

  router.get('/:session/new-message-id',
    policiesMiddleware(CanSession(Action.Read, FromBodySession)),
    async (c) => {
      const sessionName = c.req.param('session');
      const manager = container.resolve(SessionManager);
      try {
        const session = manager.getSession(sessionName);
        const id = await (session as any).generateNewMessageId();
        return c.json({ id });
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  // ===== OpenWA parity: sticker send (image/webp via sendFile) =====
  router.post('/sendSticker',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      const chatId = body.chatId || body.to;
      if (!chatId || !body.file || !body.file.data) {
        return c.json({ error: 'chatId and file.data (base64 webp/png) required' }, 400);
      }
      try {
        const buffer = Buffer.from(body.file.data, 'base64');
        // Stickers ride the media pipeline as image/webp
        const result = await (session as any).sendFile({
          chatId,
          file: { mimetype: 'image/webp', data: buffer },
          caption: undefined,
          sendMediaAsSticker: true,
        });
        return c.json({ success: true, id: result?.key?.id ?? result?._id ?? null });
      } catch (e: any) {
        return c.json({ error: String(e?.message || e) }, 500);
      }
    }
  );

  return router;
}

// ===== OpenWA parity: bulk messaging =====

export function createBulkRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();
  router.use('*', apiKeyAuthMiddleware());
  const batches = new Map<string, BulkMessageService>();

  function getBulk(session: any): BulkMessageService {
    const key = (session as any).sessionId ?? 'default';
    if (!batches.has(key)) {
      batches.set(key, new BulkMessageService(
        (chatId: string, text: string) => (session as any).sendTextMessage(chatId, text),
        (chatId: string, buffer: Buffer, caption?: string) => (session as any).sendImageMessage(chatId, buffer, caption),
        (chatId: string, buffer: Buffer, caption?: string) => (session as any).sendVideoMessage(chatId, buffer, caption),
        (chatId: string, buffer: Buffer) => (session as any).sendVoiceMessage(chatId, buffer),
        (chatId: string, buffer: Buffer, filename?: string) => (session as any).sendDocumentMessage(chatId, buffer, filename),
      ));
    }
    return batches.get(key)!;
  }

  router.post('/:session/messages/send-bulk',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      if (!Array.isArray(body.recipients)) return c.json({ error: 'recipients[] required' }, 400);
      const bulk = getBulk(session);
      const batch = bulk.createBatch(
        (session as any).sessionId ?? 'default',
        body.recipients,
        body.content ?? {},
        { delayMs: body.delayMs, randomizeDelay: body.randomizeDelay, stopOnError: body.stopOnError, template: body.template },
      );
      void bulk.processBatch(batch.id);
      return c.json({ success: true, batchId: batch.id, total: batch.recipients.length }, 201);
    }
  );

  router.get('/:session/messages/batch/:batchId',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const bulk = getBulk(session);
      const batch = bulk.getBatch(c.req.param('batchId'));
      if (!batch) return c.json({ error: 'batch not found' }, 404);
      return c.json(batch);
    }
  );

  router.post('/:session/messages/batch/:batchId/cancel',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const bulk = getBulk(session);
      const ok = bulk.cancelBatch(c.req.param('batchId'));
      return c.json({ success: ok }, ok ? 200 : 404);
    }
  );

  return router;
}

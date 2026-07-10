import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
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

export function createChattingRouter(): Hono {
  const router = new Hono();

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

  return router;
}

import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createChatsRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/chats',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const chats = await (session as any).getChats({ limit, offset });
      return c.json(chats);
    }
  );

  router.get('/:session/chats/overview',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const chats = await (session as any).getChatsOverview({ limit, offset });
      return c.json(chats);
    }
  );

  router.post('/:session/chats/overview',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      const chats = await (session as any).getChatsOverview(body);
      return c.json(chats);
    }
  );

  router.get('/:session/chats/:chatId',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ id: c.req.param('chatId') });
    }
  );

  router.delete('/:session/chats/:chatId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ result: true });
    }
  );

  router.get('/:session/chats/:chatId/picture',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const url = await (session as any).getContactProfilePicture(chatId, false);
      return c.json({ url });
    }
  );

  router.get('/:session/chats/:chatId/messages',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const downloadMedia = c.req.query('downloadMedia') === 'true';
      const messages = await (session as any).getChatMessages(
        chatId,
        { limit, offset, downloadMedia },
        {}
      );
      return c.json(messages);
    }
  );

  router.post('/:session/chats/:chatId/messages/read',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const body = await c.req.json();
      await (session as any).readChatMessages(chatId, body);
      return c.json({ result: true });
    }
  );

  router.get('/:session/chats/:chatId/messages/:messageId',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      const message = await (session as any).getChatMessage(chatId, messageId, {});
      return c.json(message);
    }
  );

  router.post('/:session/chats/:chatId/messages/:messageId/pin',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      const body = await c.req.json();
      await (session as any).pinMessage(chatId, messageId, body.duration || 7);
      return c.json({ success: true });
    }
  );

  router.post('/:session/chats/:chatId/messages/:messageId/unpin',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      await (session as any).unpinMessage(chatId, messageId);
      return c.json({ success: true });
    }
  );

  router.delete('/:session/chats/:chatId/messages',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ result: true });
    }
  );

  router.delete('/:session/chats/:chatId/messages/:messageId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      await (session as any).deleteMessage(chatId, messageId);
      return c.json({ result: true });
    }
  );

  router.put('/:session/chats/:chatId/messages/:messageId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      const body = await c.req.json();
      await (session as any).editMessage(chatId, messageId, body);
      return c.json({ result: true });
    }
  );

  router.post('/:session/chats/:chatId/archive',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      await (session as any).chatsArchiveChat(chatId);
      return c.json({ result: true });
    }
  );

  router.post('/:session/chats/:chatId/unarchive',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      await (session as any).chatsUnarchiveChat(chatId);
      return c.json({ result: true });
    }
  );

  router.post('/:session/chats/:chatId/unread',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      await (session as any).chatsUnreadChat(chatId);
      return c.json({ result: true });
    }
  );

  router.post('/:session/chats/:chatId/read',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      await (session as any).readChatMessages(chatId, { count: 1 });
      return c.json({ result: true });
    }
  );

// ===== OpenWA parity: chat mute/unmute =====
  router.post('/:session/chats/:chatId/mute',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const body = await c.req.json().catch(() => ({}));
      if (typeof (session as any).muteChat === 'function') {
        await (session as any).muteChat(chatId, body.duration);
        return c.json({ success: true, chatId, muted: true });
      }
      return c.json({ success: false, error: 'mute not supported by this engine' }, 400);
    }
  );

  router.post('/:session/chats/:chatId/unmute',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      if (typeof (session as any).unmuteChat === 'function') {
        await (session as any).unmuteChat(chatId);
        return c.json({ success: true, chatId, muted: false });
      }
      return c.json({ success: false, error: 'unmute not supported by this engine' }, 400);
    }
  );

  // ===== OpenWA parity: download a single message's media =====
  router.get('/:session/chats/:chatId/messages/:messageId/media',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      const msg = await (session as any).getChatMessage(chatId, messageId, { downloadMedia: true });
      if (!msg || !(msg as any).media) {
        return c.json({ error: 'no media on message or download failed' }, 404);
      }
      return c.json((msg as any).media);
    }
  );

  // ===== OpenWA parity: reactions of a message =====
  router.get('/:session/chats/:chatId/messages/:messageId/reactions',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const messageId = c.req.param('messageId');
      const msg = await (session as any).getChatMessage(chatId, messageId, {}) as any;
      const reactions = msg?.reactions ?? [];
      return c.json({ chatId, messageId, reactions });
    }
  );

  return router;
}

import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createChannelsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/channels',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const channels = await (session as any).channelsList({});
      return c.json(channels);
    }
  );

  router.post('/:session/channels',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      try {
        const result = await (session as any).channelsCreateChannel(body);
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.delete('/:session/channels/:id',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      await (session as any).channelsDeleteChannel(id);
      return c.json({ result: true });
    }
  );

  router.get('/:session/channels/:id',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      try {
        const channel = await (session as any).channelsGetChannel(id);
        return c.json(channel);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.get('/:session/channels/:id/messages/preview',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      try {
        const messages = await (session as any).previewChannelMessages(id, {});
        return c.json(messages);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/:session/channels/:id/follow',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      await (session as any).channelsFollowChannel(id);
      return c.json({ result: true });
    }
  );

  router.post('/:session/channels/:id/unfollow',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      await (session as any).channelsUnfollowChannel(id);
      return c.json({ result: true });
    }
  );

  router.post('/:session/channels/:id/mute',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      await (session as any).channelsMuteChannel(id);
      return c.json({ result: true });
    }
  );

  router.post('/:session/channels/:id/unmute',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      await (session as any).channelsUnmuteChannel(id);
      return c.json({ result: true });
    }
  );

  router.post('/:session/channels/search/by-view',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      try {
        const result = await (session as any).searchChannelsByView(body);
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/:session/channels/search/by-text',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      try {
        const result = await (session as any).searchChannelsByText(body);
        return c.json(result);
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.get('/:session/channels/search/views',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json([]);
    }
  );

  router.get('/:session/channels/search/countries',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json([]);
    }
  );

  router.get('/:session/channels/search/categories',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json([]);
    }
  );

  return router;
}

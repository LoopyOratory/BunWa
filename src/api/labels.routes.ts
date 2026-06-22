import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createLabelsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/labels/',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const labels = await (session as any).getLabels();
      return c.json(labels);
    }
  );

  router.post('/:session/labels/',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      const result = await (session as any).createLabel(body);
      return c.json(result);
    }
  );

  router.put('/:session/labels/:labelId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const labelId = c.req.param('labelId');
      const body = await c.req.json();
      const label = await (session as any).getLabel(labelId);
      if (!label) {
        return c.json({ statusCode: 404, message: `Label ${labelId} not found` }, 404);
      }
      const updated = await (session as any).updateLabel({ ...label, ...body, id: labelId });
      return c.json(updated);
    }
  );

  router.delete('/:session/labels/:labelId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const labelId = c.req.param('labelId');
      const label = await (session as any).getLabel(labelId);
      if (!label) {
        return c.json({ statusCode: 404, message: `Label ${labelId} not found` }, 404);
      }
      await (session as any).deleteLabel(label);
      return c.json({ result: true });
    }
  );

  router.get('/:session/labels/chats/:chatId',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const labels = await (session as any).getChatLabels(chatId);
      return c.json(labels);
    }
  );

  router.put('/:session/labels/chats/:chatId',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const chatId = c.req.param('chatId');
      const body = await c.req.json();
      await (session as any).putLabelsToChat(chatId, body.labels);
      return c.json({ result: true });
    }
  );

  router.get('/:session/labels/:labelId/chats',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const labelId = c.req.param('labelId');
      const chats = await (session as any).getChatsByLabelId(labelId);
      return c.json(chats);
    }
  );

  return router;
}

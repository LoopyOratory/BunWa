import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createGroupsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/groups',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const groups = await (session as any).getGroups({});
      return c.json(groups);
    }
  );

  router.get('/:session/groups/count',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const groups = await (session as any).getGroups({});
      return c.json({ count: Object.keys(groups).length });
    }
  );

  router.get('/:session/groups/join-info',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const code = c.req.query('code');
      if (!code) {
        return c.json({ statusCode: 400, message: 'code query param required' }, 400);
      }
      const info = await (session as any).joinInfoGroup(code);
      return c.json(info);
    }
  );

  router.post('/:session/groups/join',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      const result = await (session as any).joinGroup(body.code);
      return c.json(result);
    }
  );

  router.post('/:session/groups/refresh',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      await (session as any).refreshGroups();
      return c.json({ success: true });
    }
  );

  router.post('/:session/groups',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      const result = await (session as any).createGroup({
        name: body.name,
        participants: body.participants || [],
      });
      return c.json(result);
    }
  );

  router.get('/:session/groups/:id',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const group = await (session as any).getGroup(id);
      return c.json(group);
    }
  );

  router.delete('/:session/groups/:id',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ statusCode: 500, message: 'Delete group not available in NOWEB engine' }, 500);
    }
  );

  router.post('/:session/groups/:id/leave',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      await (session as any).leaveGroup(id);
      return c.json({ result: true });
    }
  );

  router.get('/:session/groups/:id/picture',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ url: null });
    }
  );

  router.put('/:session/groups/:id/picture',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ statusCode: 500, message: 'Set group picture not available' }, 500);
    }
  );

  router.delete('/:session/groups/:id/picture',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      return c.json({ statusCode: 500, message: 'Delete group picture not available' }, 500);
    }
  );

  router.put('/:session/groups/:id/description',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      await (session as any).setDescription(id, body.description);
      return c.json({ result: true });
    }
  );

  router.put('/:session/groups/:id/subject',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      await (session as any).setSubject(id, body.subject);
      return c.json({ result: true });
    }
  );

  router.put('/:session/groups/:id/settings/security/info-admin-only',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      await (session as any).setInfoAdminsOnly(id, body.adminsOnly);
      return c.json({ result: true });
    }
  );

  router.get('/:session/groups/:id/settings/security/info-admin-only',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const result = await (session as any).getInfoAdminsOnly(id);
      return c.json(result);
    }
  );

  router.put('/:session/groups/:id/settings/security/messages-admin-only',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      await (session as any).setMessagesAdminsOnly(id, body.adminsOnly);
      return c.json({ result: true });
    }
  );

  router.get('/:session/groups/:id/settings/security/messages-admin-only',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const result = await (session as any).getMessagesAdminsOnly(id);
      return c.json(result);
    }
  );

  router.get('/:session/groups/:id/invite-code',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const code = await (session as any).getInviteCode(id);
      return c.json({ code });
    }
  );

  router.post('/:session/groups/:id/invite-code/revoke',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const code = await (session as any).revokeInviteCode(id);
      return c.json({ code });
    }
  );

  router.get('/:session/groups/:id/participants/',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const participants = await (session as any).getGroupParticipants(id);
      return c.json(participants);
    }
  );

  router.get('/:session/groups/:id/participants/v2',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const participants = await (session as any).getParticipants(id);
      return c.json(participants);
    }
  );

  router.post('/:session/groups/:id/participants/add',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      const result = await (session as any).addParticipants(id, { participants: body.participants });
      return c.json(result);
    }
  );

  router.post('/:session/groups/:id/participants/remove',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      const result = await (session as any).removeParticipants(id, { participants: body.participants });
      return c.json(result);
    }
  );

  router.post('/:session/groups/:id/admin/promote',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      const result = await (session as any).promoteParticipantsToAdmin(id, { participants: body.participants });
      return c.json(result);
    }
  );

  router.post('/:session/groups/:id/admin/demote',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const id = c.req.param('id');
      const body = await c.req.json();
      const result = await (session as any).demoteParticipantsToUser(id, { participants: body.participants });
      return c.json(result);
    }
  );

  return router;
}

import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromQuery } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { NotFoundException } from '../core/exceptions';
import { getSessionFromBody } from '../middleware/get-session-from-body';

export function createContactsRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/contacts/all',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    async (c) => {
      const sessionName = c.req.query('session');
      if (!sessionName) {
        return c.json({ statusCode: 400, message: 'session query param required' }, 400);
      }
      const manager = container.resolve(SessionManager);
      try {
        const session = manager.getSession(sessionName);
        const contacts = await (session as any).getContacts({});
        return c.json(contacts);
      } catch (e: any) {
        if (e instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: `Session ${sessionName} not found or not working` }, 404);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.get('/contacts',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    async (c) => {
      const sessionName = c.req.query('session');
      const contactId = c.req.query('contactId');
      if (!sessionName || !contactId) {
        return c.json({ statusCode: 400, message: 'session and contactId query params required' }, 400);
      }
      const manager = container.resolve(SessionManager);
      try {
        const session = manager.getSession(sessionName);
        const contact = await (session as any).getContact({ contactId });
        return c.json(contact);
      } catch (e: any) {
        if (e instanceof NotFoundException) {
          return c.json({ statusCode: 404, message: `Session ${sessionName} not found or not working` }, 404);
        }
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.get('/contacts/check-exists',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
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

  router.get('/contacts/about',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    async (c) => {
      return c.json({ about: '' });
    }
  );

  router.get('/contacts/profile-picture',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    async (c) => {
      const sessionName = c.req.query('session');
      const contactId = c.req.query('contactId');
      if (!sessionName || !contactId) {
        return c.json({ statusCode: 400, message: 'session and contactId query params required' }, 400);
      }
      const manager = container.resolve(SessionManager);
      try {
        const session = manager.getSession(sessionName);
        const url = await (session as any).fetchContactProfilePicture(contactId);
        return c.json({ profilePictureURL: url });
      } catch (e: any) {
        return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
      }
    }
  );

  router.post('/contacts/block',
    policiesMiddleware(CanSession(Action.Send, FromQuery('session'))),
    getSessionFromBody(),
    async (c) => {
      return c.json({ statusCode: 500, message: 'Block not available in NOWEB engine' }, 500);
    }
  );

  router.post('/contacts/unblock',
    policiesMiddleware(CanSession(Action.Send, FromQuery('session'))),
    getSessionFromBody(),
    async (c) => {
      return c.json({ statusCode: 500, message: 'Unblock not available in NOWEB engine' }, 500);
    }
  );

  return router;
}

import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromQuery } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { NotFoundException } from '../core/exceptions';
import { workingSessionQueryResolver } from '../middleware/session-resolver';
import { getSessionFromBody } from '../middleware/get-session-from-body';

export function createContactsRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();

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
    workingSessionQueryResolver(),
    async (c) => {
      const session = c.get('session');
      const phone = c.req.query('phone');
      if (!phone) {
        return c.json({ statusCode: 400, message: 'session and phone query params required' }, 400);
      }
      const result = await (session as any).checkNumberStatus({ phone });
      return c.json(result);
    }
  );

  router.get('/contacts/about',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    workingSessionQueryResolver(),
    async (c) => {
      const session = c.get('session');
      const contactId = c.req.query('contactId');
      if (!contactId) {
        return c.json({ statusCode: 400, message: 'session and contactId query params required' }, 400);
      }
      return c.json(await (session as any).getContactAbout({ contactId }));
    }
  );

  router.get('/contacts/profile-picture',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    workingSessionQueryResolver(),
    async (c) => {
      const session = c.get('session');
      const contactId = c.req.query('contactId');
      if (!contactId) {
        return c.json({ statusCode: 400, message: 'session and contactId query params required' }, 400);
      }
      const url = await (session as any).fetchContactProfilePicture(contactId);
      return c.json({ profilePictureURL: url });
    }
  );

  /**
   * Same-origin image proxy for profile pictures. WhatsApp serves these from
   * pps.whatsapp.net / fbcdn.net, which do not send CORS headers; the browser
   * cannot read them directly. Only WhatsApp CDN hosts are allowed.
   */
  router.get('/contacts/profile-picture/image',
    policiesMiddleware(CanSession(Action.Read, FromQuery('session'))),
    workingSessionQueryResolver(),
    async (c) => {
      const session = c.get('session');
      const contactId = c.req.query('contactId');
      if (!contactId) return c.body(null, 400);
      const url = await (session as any).fetchContactProfilePicture(contactId);
      if (!url) return c.body(null, 204);
      let target: URL;
      try {
        target = new URL(url);
      } catch {
        return c.body(null, 204);
      }
      const host = target.hostname.toLowerCase();
      const allowed = host === 'pps.whatsapp.net'
        || host.endsWith('.whatsapp.net')
        || host.endsWith('.fbcdn.net')
        || host.endsWith('.cdninstagram.com');
      if (target.protocol !== 'https:' || !allowed) return c.body(null, 204);
      try {
        const response = await fetch(target.toString(), { signal: AbortSignal.timeout(10_000) });
        if (!response.ok || !response.body) return c.body(null, 204);
        return new Response(response.body, {
          headers: {
            'Content-Type': response.headers.get('content-type') || 'image/jpeg',
            'Cache-Control': 'private, max-age=3600',
          },
        });
      } catch {
        return c.body(null, 204);
      }
    }
  );

  router.post('/contacts/block',
    policiesMiddleware(CanSession(Action.Send, FromQuery('session'))),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await (session as any).blockContact({
        session: body.session,
        contactId: body.contactId,
      });
      return c.json(result);
    }
  );

  router.post('/contacts/unblock',
    policiesMiddleware(CanSession(Action.Send, FromQuery('session'))),
    getSessionFromBody(),
    async (c) => {
      const session = c.get('session');
      const body = c.get('body');
      const result = await (session as any).unblockContact({
        session: body.session,
        contactId: body.contactId,
      });
      return c.json(result);
    }
  );

  return router;
}

import { Hono } from 'hono';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

export function createSyncRouter(): Hono<{ Variables: { session: any } }> {
  const router = new Hono<{ Variables: { session: any } }>();
  router.use('*', apiKeyAuthMiddleware());
  router.get('/:session/sync',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    (c) => c.json(c.get('session').getHistorySyncStatus()),
  );
  return router;
}

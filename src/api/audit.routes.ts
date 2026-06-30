import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';
import { AuditService } from '../core/audit/audit.service';

export function createAuditRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/audit',
    policiesMiddleware(CanServer(Action.Read)),
    async (c) => {
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const severityFilter = c.req.query('severity');

      const auditService = container.resolve(AuditService);
      const result = await auditService.findAll({
        limit,
        offset,
        severity: severityFilter && severityFilter !== 'all' ? severityFilter as any : undefined,
      });

      return c.json(result.data);
    }
  );

  return router;
}

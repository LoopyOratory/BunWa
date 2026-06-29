import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';

const SEVERITIES = ['INFO', 'WARN', 'ERROR'] as const;
const ACTIONS = [
  'session.create', 'session.start', 'session.stop', 'session.delete',
  'message.send', 'message.receive',
  'webhook.create', 'webhook.delete', 'webhook.test',
  'api.key.create', 'api.key.delete',
  'config.update',
] as const;

export function createAuditRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/audit?limit=50&offset=0
  router.get('/audit',
    policiesMiddleware(CanServer(Action.Read)),
    async (c) => {
      const limit = parseInt(c.req.query('limit') || '50');
      const offset = parseInt(c.req.query('offset') || '0');
      const severityFilter = c.req.query('severity');

      let logs = generateMockLogs(200);

      if (severityFilter && severityFilter !== 'all') {
        logs = logs.filter((l) => l.severity === severityFilter);
      }

      const paginated = logs.slice(offset, offset + limit);
      return c.json(paginated);
    }
  );

  return router;
}

function generateMockLogs(count: number): any[] {
  const logs: any[] = [];
  const baseTime = Date.now() - count * 60000;
  for (let i = 0; i < count; i++) {
    const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];
    const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    logs.push({
      id: `log_${i}`,
      action,
      severity,
      message: `${action.replace('.', ' ')} operation completed`,
      sessionId: Math.random() > 0.4 ? `session_${Math.floor(Math.random() * 3)}` : undefined,
      apiKeyId: Math.random() > 0.7 ? `key_${Math.floor(Math.random() * 5)}` : undefined,
      ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
      createdAt: new Date(baseTime + i * 60000).toISOString(),
    });
  }
  return logs.reverse();
}

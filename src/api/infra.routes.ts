import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';

export function createInfraRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/infra/config
  router.get('/infra/config',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      return c.json({
        database: {
          type: process.env.WAHA_DB_TYPE || 'sqlite',
          host: process.env.WAHA_DB_HOST || 'localhost',
          port: process.env.WAHA_DB_PORT || '5432',
          username: process.env.WAHA_DB_USERNAME || '',
          name: process.env.WAHA_DB_NAME || './data/waha.sqlite',
          ssl: process.env.WAHA_DB_SSL === 'true',
        },
        storage: {
          type: process.env.WAHA_STORAGE_TYPE || 'local',
          localPath: process.env.WAHA_STORAGE_LOCAL_PATH || './data/media',
          s3: {
            endpoint: process.env.WAHA_S3_ENDPOINT || '',
            bucket: process.env.WAHA_S3_BUCKET || '',
            region: process.env.WAHA_S3_REGION || 'us-east-1',
            accessKeyId: process.env.WAHA_S3_ACCESS_KEY || '',
            secretAccessKey: process.env.WAHA_S3_SECRET_KEY || '',
          },
        },
        queue: {
          enabled: process.env.WAHA_QUEUE_ENABLED === 'true',
          redis: {
            host: process.env.WAHA_REDIS_HOST || 'localhost',
            port: process.env.WAHA_REDIS_PORT || '6379',
            password: process.env.WAHA_REDIS_PASSWORD || '',
          },
        },
        engine: process.env.WHATSAPP_DEFAULT_ENGINE || 'baileys',
      });
    }
  );

  // PUT /api/infra/config
  router.put('/infra/config',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json();
      // In stub mode, we just acknowledge the update
      return c.json({ result: true, config: body });
    }
  );

  // POST /api/infra/restart
  router.post('/infra/restart',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      // In stub mode, we return success without actually restarting
      return c.json({ result: true, message: 'Server restart initiated' });
    }
  );

  return router;
}

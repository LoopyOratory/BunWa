import { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import pino from 'pino';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';

const logger = pino({ name: 'InfraRoutes' });

/** Path to the .env file the running process reads its config from. */
function envPath(): string {
  return resolve(process.cwd(), '.env');
}

/**
 * Upsert a set of KEY=value pairs into the .env file, preserving unrelated
 * lines, comments, and ordering. Also mirrors the values into process.env so a
 * subsequent GET reflects the saved state immediately (the app itself only
 * applies most of them on the next restart).
 */
function persistEnv(updates: Record<string, string>): void {
  const path = envPath();
  const lines = existsSync(path)
    ? readFileSync(path, 'utf8').split('\n')
    : [];

  const remaining = new Map(Object.entries(updates));
  const out = lines.map((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m && remaining.has(m[1])) {
      const key = m[1];
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  // Append any keys that weren't already present.
  for (const [key, value] of remaining) {
    out.push(`${key}=${value}`);
  }

  writeFileSync(path, out.join('\n'), 'utf8');

  // Reflect immediately so GET returns the saved values before a restart.
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}

/** Map the dashboard's nested config object to the flat env vars GET reads. */
function configToEnv(body: any): Record<string, string> {
  const env: Record<string, string> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined && value !== null) env[key] = String(value);
  };

  if (body.database) {
    set('WAHA_DB_TYPE', body.database.type);
    set('WAHA_DB_HOST', body.database.host);
    set('WAHA_DB_PORT', body.database.port);
    set('WAHA_DB_USERNAME', body.database.username);
    set('WAHA_DB_NAME', body.database.name);
    set('WAHA_DB_SSL', body.database.ssl);
  }
  if (body.storage) {
    set('WAHA_STORAGE_TYPE', body.storage.type);
    set('WAHA_STORAGE_LOCAL_PATH', body.storage.localPath);
    if (body.storage.s3) {
      set('WAHA_S3_ENDPOINT', body.storage.s3.endpoint);
      set('WAHA_S3_BUCKET', body.storage.s3.bucket);
      set('WAHA_S3_REGION', body.storage.s3.region);
      set('WAHA_S3_ACCESS_KEY', body.storage.s3.accessKeyId);
      set('WAHA_S3_SECRET_KEY', body.storage.s3.secretAccessKey);
    }
  }
  if (body.queue) {
    set('WAHA_QUEUE_ENABLED', body.queue.enabled);
    if (body.queue.redis) {
      set('WAHA_REDIS_HOST', body.queue.redis.host);
      set('WAHA_REDIS_PORT', body.queue.redis.port);
      set('WAHA_REDIS_PASSWORD', body.queue.redis.password);
    }
  }
  set('WHATSAPP_DEFAULT_ENGINE', body.engine);
  return env;
}

export function createInfraRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  // GET /api/infra/config
  router.get('/infra/config',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      return c.json({
        database: {
          // Normalise casing so the value always matches the dashboard's
          // lowercase select options (the .env may use SQLITE/POSTGRES).
          type: (process.env.WAHA_DB_TYPE || 'sqlite').toLowerCase(),
          host: process.env.WAHA_DB_HOST || 'localhost',
          port: process.env.WAHA_DB_PORT || '5432',
          username: process.env.WAHA_DB_USERNAME || '',
          name: process.env.WAHA_DB_NAME || './data/waha.sqlite',
          ssl: process.env.WAHA_DB_SSL === 'true',
        },
        storage: {
          // Lowercased to match the dashboard select (.env ships WAHA_STORAGE_TYPE=LOCAL).
          type: (process.env.WAHA_STORAGE_TYPE || 'local').toLowerCase(),
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
        // Uppercased to match the app's engine ids (NOWEB/WEBJS) and the
        // dashboard's engine cards.
        engine: (process.env.WHATSAPP_DEFAULT_ENGINE || 'NOWEB').toUpperCase(),
      });
    }
  );

  // PUT /api/infra/config — persist config to .env (applied on next restart)
  router.put('/infra/config',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json();
      try {
        const env = configToEnv(body);
        persistEnv(env);
        logger.info({ keys: Object.keys(env) }, 'Infra config persisted to .env');
        return c.json({ result: true, persisted: Object.keys(env), config: body });
      } catch (err: any) {
        logger.error({ err: err.message, path: envPath() }, 'Failed to persist infra config');
        return c.json(
          { result: false, message: `Failed to write config: ${err.message}` },
          500,
        );
      }
    }
  );

  // POST /api/infra/restart — exit the process so the container/supervisor
  // restarts it with the freshly-saved .env. Requires a restart policy
  // (Docker --restart / Coolify / systemd); a bare `bun run` will NOT come
  // back up on its own.
  router.post('/infra/restart',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      logger.warn('Restart requested via API — process will exit in 300ms');
      // Defer the exit so this response flushes to the client first.
      setTimeout(() => process.exit(0), 300);
      return c.json({ result: true, message: 'Server restarting' });
    }
  );

  return router;
}

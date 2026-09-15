import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { container } from 'tsyringe';
import { configureContainer } from './di/container';
import { WhatsappConfigService } from './config.service';
import { VERSION } from './version';
import { globalErrorHandler } from './middleware/error-handler';
import { createApiRouter } from './api';
import { createMcpRouter } from './mcp';
import { createWebSocketHandler, setSessionManager } from './api/websocket';
import { DashboardConfigServiceCore } from './core/config/DashboardConfigServiceCore';
import { SwaggerConfigServiceCore } from './core/config/SwaggerConfigServiceCore';
import { basicAuthMiddleware } from './middleware/basic-auth';
import { rateLimit, setBunServer } from './middleware/rate-limit';
import { buildOpenApiSpec } from './swagger';
import { existsSync } from 'fs';
import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { SessionManager } from './core/manager.core';
import { ChatwootAppService } from './apps/chatwoot/services/ChatwootAppService';
import { shutdownService } from './core/shutdown.service';
import { createChatwootWebhookRouter } from './apps/chatwoot/api/chatwoot-webhook.routes';
import { Scalar } from '@scalar/hono-api-reference';
import pino from 'pino';
import { timingSafeEqual } from 'crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isPathSafe(resolvedPath: string, rootDir: string): boolean {
  const resolved = resolve(resolvedPath);
  const root = resolve(rootDir);
  return resolved.startsWith(root + '/') || resolved === root;
}

// Content-hashed build artefacts (Vite emits `name-<hash>.ext`) can be cached
// forever; everything else gets a shorter TTL so rebuilds are picked up.
const IMMUTABLE_ASSET = /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/**
 * Serve one file from disk with conditional-request support.
 *
 * Bun infers Content-Type from the extension and handles Range requests
 * natively for file responses, so neither is hand-rolled here. ETags are added
 * because Bun does not generate them: without one, every dashboard reload
 * re-downloads the bundle instead of getting a 304.
 *
 * Returns null when the path does not exist, leaving the fallback to the caller.
 */
async function serveStaticFile(filePath: string, ifNoneMatch: string | null): Promise<Response | null> {
  let fileStat;
  try {
    fileStat = await stat(filePath); // async: does not block the event loop per request
  } catch {
    return null;
  }
  if (fileStat.isDirectory()) {
    return serveStaticFile(join(filePath, 'index.html'), ifNoneMatch);
  }

  const isHtml = filePath.endsWith('.html');
  const etag = `W/"${fileStat.size}-${Math.floor(fileStat.mtimeMs)}"`;
  const headers: Record<string, string> = {
    ETag: etag,
    'Last-Modified': fileStat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': isHtml
      ? 'no-cache'
      : IMMUTABLE_ASSET.test(filePath)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=86400',
  };

  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(Bun.file(filePath), { headers });
}

const log = pino({
  level: process.env.WAHA_LOG_LEVEL || 'info',
  transport: process.env.WAHA_LOG_LEVEL === 'debug' ? {
    target: 'pino-pretty',
    options: { colorize: true },
  } : undefined,
}).child({ name: 'Bootstrap' });

process.on('uncaughtException', (err) => {
  log.error(err, 'Uncaught Exception');
});
process.on('unhandledRejection', (reason, promise) => {
  log.error({ promise }, 'Unhandled Rejection');
  if (reason instanceof Error) {
    log.error(reason.stack);
  }
});

async function bootstrap() {
  log.info(`BUNWA (WhatsApp HTTP API) - Running ${VERSION.tier} version...`);

  const container = configureContainer();
  const config = container.resolve(WhatsappConfigService);
  const dashboardConfig = container.resolve(DashboardConfigServiceCore);
  const swaggerConfig = container.resolve(SwaggerConfigServiceCore);
  const sessionManager = container.resolve(SessionManager);
  setSessionManager(sessionManager);

  // Warn if running without API key in fail-closed mode
  const apiKey = config.getApiKey();
  const allowNoAuth = process.env.WAHA_ALLOW_NO_AUTH !== 'false';
  if (!apiKey && !allowNoAuth) {
    log.warn('WAHA_ALLOW_NO_AUTH=false but no WAHA_API_KEY is set — all API requests will be rejected. Set WAHA_API_KEY or remove WAHA_ALLOW_NO_AUTH.');
  }

  // Restore sessions from disk and start predefined ones
  await sessionManager.restoreSessions();
  await sessionManager.startPredefinedSessions();

  const app = new Hono();

  app.use('*', logger());

  // CORS: configurable origin via WAHA_CORS_ORIGIN env var
  // When no origin is set, use '*' without credentials (safe default)
  // When origin is set, allow credentials for that specific origin
  const corsOrigin = process.env.WAHA_CORS_ORIGIN;
  const hasExplicitOrigin = !!corsOrigin && corsOrigin !== '*';
  app.use('*', cors({
    origin: hasExplicitOrigin
      ? corsOrigin.split(',').map(s => s.trim())
      : '*',
    allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'x-api-key', 'Authorization', 'X-Requested-With'],
    exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
    maxAge: 86400,
    credentials: hasExplicitOrigin,
  }));

  app.use('/api/*', rateLimit({ windowMs: 60_000, max: 200 }));

  // Body size limit — 10MB max for all API routes
  app.use('/api/*', async (c, next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      return c.json({ statusCode: 413, message: 'Request body too large (max 10MB)' }, 413);
    }
    return next();
  });

  app.onError(globalErrorHandler);

  // Serve Swagger UI
  if (swaggerConfig.enabled) {
    const credentials = swaggerConfig.credentials;
    if (credentials) {
      app.use('/api-docs/*', basicAuthMiddleware(credentials[0], credentials[1]));
    }

    app.get('/api-docs', (c) => {
      const spec = buildOpenApiSpec();
      return c.json(spec);
    });

    app.get('/api-docs/', Scalar({
      url: '/api-docs',
      pageTitle: 'BUNWA API Documentation',
    }));

    log.info(`API Reference (Scalar) available at: /api-docs`);
  }

  // Dashboard login endpoint — rate-limited to prevent brute-force
  const dashboardCredentials = dashboardConfig.credentials;
  if (dashboardCredentials) {
    app.get('/api/dashboard/login',
      rateLimit({ windowMs: 60_000, max: 10, message: 'Too many login attempts' }),
      async (c) => {
      const auth = c.req.header('Authorization') || '';
      const [user, pass] = dashboardCredentials;
      // Decode the Basic auth header and compare with timing-safe comparison
      const encoded = auth.replace('Basic ', '');
      let decodedUser = '', decodedPass = '';
      try {
        const decoded = atob(encoded);
        const parts = decoded.split(':');
        decodedUser = parts[0] || '';
        decodedPass = parts.slice(1).join(':');
      } catch {}
      if (safeCompare(decodedUser, user) && safeCompare(decodedPass, pass)) {
        return c.json({ ok: true });
      }
      return c.json({ ok: false, message: 'Invalid credentials' }, 401);
    });
  } else {
    app.get('/api/dashboard/login', (c) => c.json({ ok: true }));
  }

  // Serve custom dashboard
  const customDashboardPath = join(import.meta.dir, '..', 'frontend-dist');
  if (existsSync(customDashboardPath)) {
    app.use('/*', async (c, next) => {
      const path = new URL(c.req.url).pathname;
      // Skip API and other non-static routes
      if (path.startsWith('/api/') || path.startsWith('/ping') || path.startsWith('/health') || path.startsWith('/mcp') || path.startsWith('/webhook/') || path.startsWith('/ws')) {
        return next();
      }
      const filePath = join(customDashboardPath, path === '/' ? 'index.html' : path);

      if (!isPathSafe(filePath, customDashboardPath)) {
        return next();
      }

      const file = await serveStaticFile(filePath, c.req.header('if-none-match') ?? null);
      if (file) {
        return file;
      }

      // SPA fallback: serve index.html for all non-file routes
      const indexFile = await serveStaticFile(
        join(customDashboardPath, 'index.html'),
        c.req.header('if-none-match') ?? null,
      );
      if (indexFile) {
        return indexFile;
      }

      return next();
    });

    log.info(`Custom dashboard available at: /`);
  }

  // Serve dashboard static files
  if (dashboardConfig.enabled) {
    const dashboardPath = join(import.meta.dir, '..', 'dashboard');

    // If the official dashboard hasn't been downloaded, fall back to the custom one
    const effectiveDashboardPath = existsSync(dashboardPath) ? dashboardPath : customDashboardPath;

    if (existsSync(effectiveDashboardPath)) {
      if (effectiveDashboardPath === customDashboardPath) {
        log.info('Official dashboard not found at /dashboard, using custom dashboard instead');
      }

      const credentials = dashboardConfig.credentials;
      if (credentials) {
        app.use(dashboardConfig.dashboardUri + '/*',
          basicAuthMiddleware(credentials[0], credentials[1])
        );
      }

      app.use(dashboardConfig.dashboardUri + '/*', async (c, next) => {
        const path = new URL(c.req.url).pathname;
        const filePath = join(effectiveDashboardPath, path.replace(dashboardConfig.dashboardUri, ''));

        if (!isPathSafe(filePath, effectiveDashboardPath)) {
          return next();
        }

        const file = await serveStaticFile(filePath, c.req.header('if-none-match') ?? null);
        return file ?? next();
      });

      log.info(`Dashboard available at: ${dashboardConfig.dashboardUri}`);
    } else {
      log.warn('Dashboard directory not found, serving disabled dashboard');
    }
  }

  // API routes
  const apiRouter = createApiRouter();
  app.route('/', apiRouter);

  // Chatwoot webhook routes (no auth — verified by HMAC signature header)
  const chatwootAppService = container.resolve(ChatwootAppService);
  app.route('/webhook/chatwoot', createChatwootWebhookRouter(chatwootAppService));

  // MCP (Model Context Protocol) server — stateless, new server per request
  const mcpRouter = createMcpRouter(sessionManager);
  app.route('/', mcpRouter);
  log.info('MCP server available at POST /mcp');

  // Initialize Chatwoot app service (loads configs, subscribes to events)
  chatwootAppService.init(sessionManager).catch((err) => {
    log.error({ err }, 'Failed to initialize Chatwoot app service');
  });

  const port = config.port;
  log.info(`WhatsApp HTTP API is running on: http://localhost:${port}`);

  const wsHandler = createWebSocketHandler();

  // Create server with WebSocket support
  const server = Bun.serve({
    port,
    // Reject oversized bodies at the protocol level. The /api/* middleware below
    // still returns a friendlier JSON 413, but it can only see a Content-Length
    // header — this cap also applies to chunked requests that omit one.
    maxRequestBodySize: 10 * 1024 * 1024,
    fetch: async (reqAny, server) => {
      const req = reqAny as any; // bun-types Request variance across versions
      // Handle WebSocket upgrade for /ws path
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        // Authenticate WebSocket connections
        // Browser WebSocket API doesn't support custom headers,
        // so we accept Basic auth credentials as query params for WS only
        const dashboardConfig = container.resolve(DashboardConfigServiceCore);
        const dashboardCredentials = dashboardConfig.credentials;
        const apiKey = config.getApiKey();

        // Try Basic auth from query param (dashboard login)
        const wsUser = url.searchParams.get('user');
        const wsPass = url.searchParams.get('pass');
        if (wsUser && wsPass && dashboardCredentials) {
          if (safeCompare(wsUser, dashboardCredentials[0]) &&
              safeCompare(wsPass, dashboardCredentials[1])) {
            // Valid dashboard credentials — allow WS
          } else {
            log.info(`WS /ws 401 unauthorized (invalid credentials)`);
            return new Response('Unauthorized', { status: 401 });
          }
        } else if (apiKey) {
          // Fall back to API key auth
          const providedKey = req.headers.get('x-api-key') || url.searchParams.get('x-api-key');
          if (!providedKey || providedKey.length !== apiKey.length ||
              !timingSafeEqual(Buffer.from(providedKey), Buffer.from(apiKey))) {
            log.info(`WS /ws 401 unauthorized (no key)`);
            return new Response('Unauthorized', { status: 401 });
          }
        }

        log.info(`WS /ws upgrade attempt session=${url.searchParams.get('session') || '*'} events=${url.searchParams.get('events') || '*'}`);
        const upgraded = server.upgrade(req, {
          data: { url: req.url } as any,
        });
        if (upgraded) {
          return undefined; // WebSocket upgrade successful
        }
        log.warn(`WS /ws upgrade failed`);
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // Forward to Hono for all other requests
      return app.fetch(req);
    },
    websocket: {
      // Event payloads are repetitive JSON — compression cuts bandwidth on the
      // event stream substantially (per-message deflate).
      perMessageDeflate: true,
      open: wsHandler.open,
      message: wsHandler.message,
      close: wsHandler.close,
    },
  });

  log.info(`Server running on port ${port}`);

  // Share server instance with rate-limiter for socket-IP keying
  setBunServer(server);

  // Graceful shutdown
  shutdownService.setShutdownCallback(async () => {
    log.info('Shutting down gracefully...');
    server.stop();
  });
  shutdownService.setReadyCheck(() => true);
  shutdownService.registerSignals();
}

bootstrap().catch((error) => {
  log.error(error, `Failed to start WAHA: ${error}`);
  process.exit(1);
});

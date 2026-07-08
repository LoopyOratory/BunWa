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
import { existsSync, statSync } from 'fs';
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

const log = pino({
  level: process.env.WAHA_LOG_LEVEL || 'info',
  transport: process.env.WAHA_LOG_LEVEL === 'debug' ? {
    target: 'pino-pretty',
    options: { colorize: true },
  } : undefined,
}).child({ name: 'Bootstrap' });

process.on('uncaughtException', (err) => {
  log.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise);
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
      let filePath = join(customDashboardPath, path === '/' ? 'index.html' : path);

      if (!isPathSafe(filePath, customDashboardPath)) {
        return next();
      }

      try {
        const stat = statSync(filePath);
        if (stat.isDirectory()) {
          filePath = join(filePath, 'index.html');
        }
      } catch {}

      if (existsSync(filePath)) {
        let file = Bun.file(filePath);
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mimeTypes: Record<string, string> = {
          'html': 'text/html; charset=utf-8',
          'js': 'application/javascript; charset=utf-8',
          'css': 'text/css; charset=utf-8',
          'json': 'application/json; charset=utf-8',
          'png': 'image/png',
          'svg': 'image/svg+xml',
          'woff2': 'font/woff2',
          'woff': 'font/woff',
          'ttf': 'font/ttf',
          'ico': 'image/x-icon',
          'webp': 'image/webp',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        if (ext === 'html') {
          let html = await file.text();
          // No API key injection needed — frontend uses Basic auth from dashboard login
          return new Response(html, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
        }

        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }

      // SPA fallback: serve index.html for all non-file routes
      const indexPath = join(customDashboardPath, 'index.html');
      if (existsSync(indexPath)) {
        const indexFile = Bun.file(indexPath);
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
        });
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
        let filePath = join(effectiveDashboardPath, path.replace(dashboardConfig.dashboardUri, ''));

        if (!isPathSafe(filePath, effectiveDashboardPath)) {
          return next();
        }

        // Check if path points to a directory, serve index.html
        try {
          const stat = statSync(filePath);
          if (stat.isDirectory()) {
            filePath = join(filePath, 'index.html');
          }
        } catch {}

        if (existsSync(filePath)) {
          const file = Bun.file(filePath);
          const ext = filePath.split('.').pop()?.toLowerCase() || '';
          const mimeTypes: Record<string, string> = {
            'html': 'text/html; charset=utf-8',
            'js': 'application/javascript; charset=utf-8',
            'mjs': 'application/javascript; charset=utf-8',
            'css': 'text/css; charset=utf-8',
            'json': 'application/json; charset=utf-8',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'ico': 'image/x-icon',
            'woff': 'font/woff',
            'woff2': 'font/woff2',
            'ttf': 'font/ttf',
            'webp': 'image/webp',
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          return new Response(file, {
            headers: { 'Content-Type': contentType },
          });
        }

        return next();
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
    fetch: async (req, server) => {
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

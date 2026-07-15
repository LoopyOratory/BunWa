import { Hono } from 'hono';
import { existsSync, statSync } from 'fs';
import { join, normalize, sep } from 'path';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { getLocalMediaFolder } from '../core/media/MediaStorageFactory';

// Serves media saved by MediaLocalStorage at {baseUrl}/api/files/:session/:filename.
// Requires the same X-Api-Key auth as every other /api/* route in this app
// (consistent with the codebase's actual security posture — nothing under
// /api is public except /api/version, /api/server, /ping, /health).
export function createFilesRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  router.get('/:session/:filename', (c) => {
    const session = c.req.param('session');
    const filename = c.req.param('filename');

    // Reject path traversal / separators outright rather than relying only
    // on the resolved-path prefix check below.
    if (
      !session ||
      !filename ||
      session.includes('..') ||
      filename.includes('..') ||
      session.includes(sep) ||
      filename.includes(sep)
    ) {
      return c.json({ statusCode: 400, message: 'Invalid session or filename' }, 400);
    }

    const root = normalize(getLocalMediaFolder());
    const filePath = normalize(join(root, session, filename));
    if (!filePath.startsWith(root + sep)) {
      return c.json({ statusCode: 400, message: 'Invalid session or filename' }, 400);
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return c.json({ statusCode: 404, message: 'File not found' }, 404);
    }

    const file = Bun.file(filePath);
    return new Response(file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  });

  return router;
}

import { Hono } from 'hono';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { UploadStore, PayloadTooLargeException } from '../core/uploads/upload-store';
import { uploadTickets, ticketResponse, uploadBaseUrl } from '../core/uploads/upload-tickets';
import { uploadMaxBytes } from '../core/uploads/upload-config';

/** The multipart route is the only /api route allowed past the 10 MB guard. */
export function isUploadRoute(path: string, method: string): boolean {
  return method.toUpperCase() === 'POST' && /^\/api\/[^/]+\/uploads\/?$/.test(path);
}

function tooLarge(c: any, maxBytes: number) {
  return c.json({ statusCode: 413, message: `Upload is larger than the ${maxBytes} byte limit` }, 413);
}

export function createUploadsRouter(store = new UploadStore()): Hono {
  const router = new Hono();
  router.use('*', apiKeyAuthMiddleware());
  const canSend = policiesMiddleware(CanSession(Action.Send, FromParam('session')));

  router.post('/:session/uploads/tickets', canSend, async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { token, ticket } = uploadTickets.create(c.req.param('session'), {
      filename: typeof body.filename === 'string' ? body.filename : undefined,
      maxBytes: typeof body.maxBytes === 'number' ? body.maxBytes : undefined,
    });
    return c.json(ticketResponse(uploadBaseUrl(new URL(c.req.url).origin), token, ticket), 201);
  });

  router.post('/:session/uploads', canSend, async (c) => {
    const session = c.req.param('session');
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!(file instanceof File)) {
      return c.json({ statusCode: 422, message: 'Send the file as multipart form field "file"' }, 422);
    }
    const maxBytes = uploadMaxBytes();
    try {
      const record = await store.save(session, file, {
        filename: typeof form['filename'] === 'string' ? form['filename'] : file.name,
        mimetype: file.type && file.type !== 'application/octet-stream' ? file.type.split(';')[0] : undefined,
        maxBytes,
      });
      return c.json(record, 201);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) return tooLarge(c, maxBytes);
      throw error;
    }
  });

  router.get('/:session/uploads', canSend, async (c) => c.json(await store.list(c.req.param('session'))));

  router.get('/:session/uploads/:id', canSend, async (c) => {
    const record = await store.get(c.req.param('session'), c.req.param('id'));
    return record ? c.json(record) : c.json({ statusCode: 404, message: 'Upload not found' }, 404);
  });

  router.delete('/:session/uploads/:id', canSend, async (c) => {
    const deleted = await store.delete(c.req.param('session'), c.req.param('id'));
    return deleted ? c.json({ deleted: true }) : c.json({ statusCode: 404, message: 'Upload not found' }, 404);
  });

  return router;
}

/** Keyless, single-use upload: the token in the path is the credential. */
export function createUploadTicketRouter(store = new UploadStore()): Hono {
  const router = new Hono();
  router.put('/:token', async (c) => {
    const ticket = uploadTickets.consume(c.req.param('token'));
    if (!ticket) {
      return c.json({ statusCode: 401, message: 'Upload ticket is unknown, expired or already used' }, 401);
    }
    const declared = Number.parseInt(c.req.header('content-length') ?? '', 10);
    if (Number.isFinite(declared) && declared > ticket.maxBytes) return tooLarge(c, ticket.maxBytes);
    const filename = c.req.query('filename') || c.req.header('x-filename') || ticket.filename;
    try {
      // bun-types' Request lacks .body (same variance main.ts casts around).
      const record = await store.save(ticket.session, new Response((c.req.raw as any).body), {
        filename,
        maxBytes: ticket.maxBytes,
      });
      return c.json(record, 201);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) return tooLarge(c, ticket.maxBytes);
      throw error;
    }
  });
  return router;
}

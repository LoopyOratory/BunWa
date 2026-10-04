import { ErrorHandler } from 'hono';
import {
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  UnprocessableEntityException,
  AvailableInPlusVersion,
  AvailableInPlusVersionAll,
  NotImplementedByEngineError,
  TooManyRequestsException,
} from '../core/exceptions';
import pino from 'pino';

const log = pino({ name: 'ErrorHandler' });

/**
 * Baileys and the raw w:mex directory queries reject with @hapi/boom errors.
 * WhatsApp answering 4xx is a client-facing result (a directory filter it
 * refuses, a forbidden action, rate limiting), not a server fault, so surface
 * the status and reason instead of flattening it to a generic 500. 5xx Booms
 * (session logged out, connection replaced) stay a generic 500 so no internals
 * leak.
 */
function boomClientStatusCode(err: unknown): number | null {
  const boom = err as any;
  if (boom?.isBoom !== true) {
    return null;
  }
  const statusCode = boom?.output?.statusCode;
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    return statusCode;
  }
  return null;
}

export const globalErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof NotFoundException) {
    return c.json({ statusCode: 404, message: err.message }, 404);
  }
  if (err instanceof ForbiddenException) {
    return c.json({ statusCode: 403, message: err.message }, 403);
  }
  if (err instanceof UnauthorizedException) {
    return c.json({ statusCode: 401, message: err.message }, 401);
  }
  if (err instanceof BadRequestException) {
    return c.json({ statusCode: 400, message: err.message }, 400);
  }
  if (err instanceof UnprocessableEntityException) {
    return c.json({ statusCode: 422, message: err.message }, 422);
  }
  if (err instanceof AvailableInPlusVersion) {
    return c.json({ statusCode: 422, message: err.message }, 422);
  }
  if (err instanceof AvailableInPlusVersionAll) {
    return c.json({ statusCode: 422, message: err.message }, 422);
  }
  if (err instanceof NotImplementedByEngineError) {
    return c.json({ statusCode: 422, message: err.message }, 422);
  }
  // Sending-policy blocks are expected traffic shaping, not server faults.
  // Report them as 429 with a Retry-After header and keep them out of the
  // error log.
  if (err instanceof TooManyRequestsException) {
    const retryAfterSeconds = Math.max(1, Math.ceil(err.retryAfterMs / 1000));
    c.header('Retry-After', String(retryAfterSeconds));
    return c.json(
      { statusCode: 429, message: err.message, retryAfterSeconds },
      429,
    );
  }

  const boomStatus = boomClientStatusCode(err);
  if (boomStatus !== null) {
    const message =
      err instanceof Error && err.message ? err.message : 'Request failed';
    return c.json({ statusCode: boomStatus, message }, boomStatus as any);
  }

  // Bun's protocol-level body cap (maxRequestBodySize) rejects the request while
  // the route is reading it. That is a client error, not a server fault — report
  // it the same way the /api/* Content-Length guard does, and keep it out of the
  // error log so oversized uploads do not look like crashes.
  if (err instanceof Error && err.message.includes('maxRequestBodySize')) {
    return c.json({ statusCode: 413, message: 'Request body too large (max 10MB)' }, 413);
  }

  log.error({ err }, 'Unhandled error');
  // Never expose internal error details to clients
  return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
};

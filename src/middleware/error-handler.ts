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
} from '../core/exceptions';
import pino from 'pino';

const log = pino({ name: 'ErrorHandler' });

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

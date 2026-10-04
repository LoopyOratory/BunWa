import { getEngineName } from '../config';

export const DOCS_URL = 'https://waha.devlike.pro/';

const engine = getEngineName();

export class NotImplementedByEngineError extends Error {
  /**
   * @param msg extra reason shown before the standard sentence
   * @param engineName engine that refused the operation; defaults to the
   *   process default engine, callers that know their session engine (the
   *   session base class) should pass it so the message names the engine that
   *   actually answered instead of the configured default.
   */
  constructor(msg = '', engineName?: string) {
    const engineName_ = engineName || engine;
    let error = `The method is not implemented by '${engineName_}' engine. Check the docs and try another engine: ${DOCS_URL}`;
    if (msg) {
      error = `${msg} ${error}`;
    }
    super(error);
    this.name = 'NotImplementedByEngineError';
  }
}

export class AvailableInPlusVersion extends Error {
  constructor(feature: string = 'The feature') {
    super(
      `${feature} is available only in Plus version for '${engine}' engine. Check this out: ${DOCS_URL}`,
    );
    this.name = 'AvailableInPlusVersion';
  }
}

export class AvailableInPlusVersionAll extends Error {
  constructor(feature: string = 'The feature') {
    super(
      `${feature} is available only in Plus version. Check this out: ${DOCS_URL}`,
    );
    this.name = 'AvailableInPlusVersionAll';
  }
}

export class NotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}

export class BadRequestException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestException';
  }
}

export class ForbiddenException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenException';
  }
}

export class UnauthorizedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedException';
  }
}

export class UnprocessableEntityException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnprocessableEntityException';
  }
}

/**
 * Thrown by the sending policy when a send is blocked (caps, reachout
 * timelock, quiet hours). Mapped to HTTP 429 with a Retry-After header.
 */
export class TooManyRequestsException extends Error {
  public readonly retryAfterMs: number;
  public readonly reason: string;

  constructor(retryAfterMs: number, reason: string) {
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    super(`Send blocked by the sending policy: ${reason}. Retry after ${seconds} seconds`);
    this.name = 'TooManyRequestsException';
    this.retryAfterMs = Math.max(0, retryAfterMs);
    this.reason = reason;
  }
}

/**
 * Errors the global error handler already maps to a client-facing 4xx
 * response. Route handlers rethrow these instead of flattening them into a
 * generic 500, so the reason (a blocked send, a bad target, a username that
 * cannot be resolved, an operation the engine does not implement) reaches the
 * caller.
 */
export function isClientFacingError(error: unknown): boolean {
  return (
    error instanceof BadRequestException ||
    error instanceof UnprocessableEntityException ||
    error instanceof TooManyRequestsException ||
    error instanceof NotImplementedByEngineError ||
    error instanceof AvailableInPlusVersion ||
    error instanceof AvailableInPlusVersionAll
  );
}

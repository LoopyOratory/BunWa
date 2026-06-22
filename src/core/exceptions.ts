import { getEngineName } from '../config';

export const DOCS_URL = 'https://waha.devlike.pro/';

const engine = getEngineName();

export class NotImplementedByEngineError extends Error {
  constructor(msg = '') {
    let error = `The method is not implemented by '${engine}' engine. Check the docs and try another engine: ${DOCS_URL}`;
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

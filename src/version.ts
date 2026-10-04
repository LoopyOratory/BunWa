import { getEngineName } from './config';
import { WAHAEngine } from './structures/enums.dto';
import { WAHAEnvironment } from './structures/environment.dto';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Version comes from package.json so a release only bumps one place. Reads the
 * file next to the running code rather than importing it, which keeps the
 * compiler output out of the picture and works the same in the Docker image.
 */
function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

import { existsSync } from 'fs';

export enum WAHAVersion {
  PLUS = 'PLUS',
  CORE = 'CORE',
}

export function getWAHAVersion(): WAHAVersion {
  const waha_version = process.env.WAHA_VERSION;
  if (waha_version && waha_version === WAHAVersion.CORE) {
    return WAHAVersion.CORE;
  }

  const plusExists = existsSync(`${import.meta.dir}/plus`);
  if (plusExists) {
    return WAHAVersion.PLUS;
  }

  return WAHAVersion.PLUS;
}

export function getWorker() {
  return { id: process.env.WAHA_WORKER_ID || null };
}

function getPlatform() {
  return `${process.platform}/${process.arch}`;
}

export const VERSION: WAHAEnvironment = {
  version: packageVersion(),
  engine: getEngineName(),
  tier: getWAHAVersion(),
  browser: null,
  platform: getPlatform(),
  worker: getWorker(),
};

export const IsChrome = false;

export { getEngineName };

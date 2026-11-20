import { getEngineName } from './config';
import { BUNWAEngine } from './structures/enums.dto';
import { BUNWAEnvironment } from './structures/environment.dto';
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

export enum BUNWAVersion {
  PLUS = 'PLUS',
  CORE = 'CORE',
}

export function getBunwaVersion(): BUNWAVersion {
  const waha_version = process.env.BUNWA_VERSION;
  if (waha_version && waha_version === BUNWAVersion.CORE) {
    return BUNWAVersion.CORE;
  }

  const plusExists = existsSync(`${import.meta.dir}/plus`);
  if (plusExists) {
    return BUNWAVersion.PLUS;
  }

  return BUNWAVersion.PLUS;
}

export function getWorker() {
  return { id: process.env.BUNWA_WORKER_ID || null };
}

function getPlatform() {
  return `${process.platform}/${process.arch}`;
}

export const VERSION: BUNWAEnvironment = {
  version: packageVersion(),
  engine: getEngineName(),
  tier: getBunwaVersion(),
  browser: null,
  platform: getPlatform(),
  worker: getWorker(),
};

export const IsChrome = false;

export { getEngineName };

import { getEngineName } from './config';
import { WAHAEngine } from './structures/enums.dto';
import { WAHAEnvironment } from './structures/environment.dto';
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
  version: '2026.5.1',
  engine: getEngineName(),
  tier: getWAHAVersion(),
  browser: null,
  platform: getPlatform(),
  worker: getWorker(),
};

export const IsChrome = false;

export { getEngineName };

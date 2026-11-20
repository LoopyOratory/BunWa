import { normalizeBunwaEngine } from './structures/enums.dto';

export function getEngineName(): string {
  // Legacy env spellings (BUNWEB) normalize to the canonical BUNWEB.
  return normalizeBunwaEngine(process.env.WHATSAPP_DEFAULT_ENGINE);
}

export function getNamespace(): string {
  return (process.env.BUNWA_NAMESPACE || getEngineName()).toLowerCase();
}

export function getSessionNamespace(): string {
  return (process.env.BUNWA_SESSION_NAMESPACE || getEngineName()).toLowerCase();
}

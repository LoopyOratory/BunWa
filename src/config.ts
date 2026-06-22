import { WAHAEngine } from './structures/enums.dto';

export function getEngineName(): string {
  return process.env.WHATSAPP_DEFAULT_ENGINE || WAHAEngine.NOWEB;
}

export function getNamespace(): string {
  return (process.env.WAHA_NAMESPACE || getEngineName()).toLowerCase();
}

export function getSessionNamespace(): string {
  return (process.env.WAHA_SESSION_NAMESPACE || getEngineName()).toLowerCase();
}

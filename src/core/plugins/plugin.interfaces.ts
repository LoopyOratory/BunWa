/**
 * Plugin System Interfaces — defines the contract for WAHA-Bun plugins.
 * Simplified from OpenWA's plugin.interfaces.ts (no sandbox for now).
 */

import type { HookEvent, HookHandler } from '../hooks/hook.interfaces';

export enum PluginType {
  ENGINE = 'engine',
  STORAGE = 'storage',
  QUEUE = 'queue',
  AUTH = 'auth',
  EXTENSION = 'extension',
}

export enum PluginStatus {
  INSTALLED = 'installed',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  ERROR = 'error',
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  description?: string;
  author?: string;
  main: string;
  hooks?: HookEvent[];
  permissions?: string[];
  sessions?: string[];
  sessionScoped?: boolean;
  configSchema?: Record<string, unknown>;
}

export interface IPlugin {
  onLoad?(ctx: PluginContext): Promise<void>;
  onEnable?(ctx: PluginContext): Promise<void>;
  onDisable?(ctx: PluginContext): Promise<void>;
  onUnload?(ctx: PluginContext): Promise<void>;
  onConfigChange?(config: Record<string, unknown>, ctx: PluginContext): Promise<void>;
}

export interface PluginContext {
  sessionId?: string;
  config: Record<string, unknown>;
  logger: PluginLogger;
}

export interface PluginLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface PluginInstance {
  manifest: PluginManifest;
  status: PluginStatus;
  instance?: IPlugin;
  enabledSessions?: Set<string>;
  error?: string;
}

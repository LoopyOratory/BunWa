/**
 * Plugin Loader — manages plugin lifecycle (install, enable, disable, unload).
 * Simplified from OpenWA's plugin-loader.service.ts (no sandbox, no worker threads).
 * Plugins are loaded from the plugins directory or registered programmatically.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { HookManager } from '../hooks/hook-manager';
import { HookEvent } from '../hooks/hook.interfaces';
import {
  IPlugin,
  PluginContext,
  PluginInstance,
  PluginLogger,
  PluginManifest,
  PluginStatus,
  PluginType,
} from './plugin.interfaces';

const DEFAULT_PLUGINS_DIR = join(process.cwd(), 'plugins');

function createPluginLogger(pluginId: string): PluginLogger {
  return {
    info: (msg, ...args) => console.log(`[Plugin:${pluginId}] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[Plugin:${pluginId}] WARN: ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[Plugin:${pluginId}] ERROR: ${msg}`, ...args),
    debug: (msg, ...args) => {
      if (process.env.WAHA_LOG_LEVEL === 'debug') {
        console.debug(`[Plugin:${pluginId}] ${msg}`, ...args);
      }
    },
  };
}

export class PluginLoader {
  private plugins = new Map<string, PluginInstance>();
  private pluginsDir: string;

  constructor(
    private hookManager: HookManager,
    pluginsDir?: string,
  ) {
    this.pluginsDir = pluginsDir || DEFAULT_PLUGINS_DIR;
  }

  /** Initialize: scan plugins directory for manifests */
  async init(): Promise<void> {
    if (!existsSync(this.pluginsDir)) {
      mkdirSync(this.pluginsDir, { recursive: true });
      return;
    }

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(this.pluginsDir, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      try {
        const raw = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw) as PluginManifest;
        this.plugins.set(manifest.id, {
          manifest,
          status: PluginStatus.INSTALLED,
        });
        console.log(`[PluginLoader] Found plugin: ${manifest.id} v${manifest.version}`);
      } catch (err) {
        console.error(`[PluginLoader] Failed to load manifest for ${entry.name}:`, err);
      }
    }
  }

  /** Register a plugin programmatically (for built-in plugins) */
  register(manifest: PluginManifest, instance: IPlugin): void {
    this.plugins.set(manifest.id, {
      manifest,
      status: PluginStatus.INSTALLED,
      instance,
    });
  }

  /** Enable a plugin — calls onLoad + onEnable, registers hooks */
  async enable(pluginId: string, config?: Record<string, unknown>): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);

    if (plugin.status === PluginStatus.ENABLED) return;

    const ctx: PluginContext = {
      config: config || {},
      logger: createPluginLogger(pluginId),
    };

    try {
      if (plugin.instance?.onLoad) {
        await plugin.instance.onLoad(ctx);
      }
      if (plugin.instance?.onEnable) {
        await plugin.instance.onEnable(ctx);
      }

      plugin.status = PluginStatus.ENABLED;
      console.log(`[PluginLoader] Enabled plugin: ${pluginId}`);
    } catch (err) {
      plugin.status = PluginStatus.ERROR;
      plugin.error = String(err);
      console.error(`[PluginLoader] Failed to enable ${pluginId}:`, err);
      throw err;
    }
  }

  /** Disable a plugin — calls onDisable, unregisters hooks */
  async disable(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);

    if (plugin.status === PluginStatus.DISABLED) return;

    const ctx: PluginContext = {
      config: {},
      logger: createPluginLogger(pluginId),
    };

    try {
      if (plugin.instance?.onDisable) {
        await plugin.instance.onDisable(ctx);
      }
      this.hookManager.unregisterPlugin(pluginId);
      plugin.status = PluginStatus.DISABLED;
      console.log(`[PluginLoader] Disabled plugin: ${pluginId}`);
    } catch (err) {
      console.error(`[PluginLoader] Failed to disable ${pluginId}:`, err);
      throw err;
    }
  }

  /** Unload a plugin — calls onUnload, removes from registry */
  async unload(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    if (plugin.status === PluginStatus.ENABLED) {
      await this.disable(pluginId);
    }

    const ctx: PluginContext = {
      config: {},
      logger: createPluginLogger(pluginId),
    };

    if (plugin.instance?.onUnload) {
      await plugin.instance.onUnload(ctx);
    }

    this.plugins.delete(pluginId);
  }

  /** List all plugins */
  list(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  /** Get a plugin by ID */
  get(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  /** Shutdown all enabled plugins */
  async shutdown(): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (plugin.status === PluginStatus.ENABLED) {
        try {
          await this.disable(id);
        } catch (err) {
          console.error(`[PluginLoader] Error disabling ${id} on shutdown:`, err);
        }
      }
    }
  }
}

/**
 * Hook Manager — event bus for plugin integration.
 * Ported from OpenWA's hook-manager.service.ts for Bun.
 * Features: priority ordering, re-entrancy guard, chain stop.
 */

import type { HookEvent, HookHandler, HookRegistration } from './hook.interfaces';

export class HookManager {
  private hooks = new Map<HookEvent, HookRegistration[]>();
  private pluginHooks = new Map<string, string[]>();
  private inFlightEvents = new Set<HookEvent>();

  /** Register a hook handler. Returns the hook ID for later unregistration. */
  register(pluginId: string, event: HookEvent, handler: HookHandler, priority = 100): string {
    const id = `${pluginId}:${event}:${Date.now()}`;
    const registration: HookRegistration = { id, pluginId, event, handler, priority };

    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push(registration);
    this.hooks.get(event)!.sort((a, b) => a.priority - b.priority);

    if (!this.pluginHooks.has(pluginId)) {
      this.pluginHooks.set(pluginId, []);
    }
    this.pluginHooks.get(pluginId)!.push(id);

    return id;
  }

  /** Unregister a specific hook by ID. */
  unregister(hookId: string): void {
    for (const registrations of this.hooks.values()) {
      const index = registrations.findIndex(r => r.id === hookId);
      if (index !== -1) {
        const reg = registrations[index];
        registrations.splice(index, 1);
        const pluginHookIds = this.pluginHooks.get(reg.pluginId);
        if (pluginHookIds) {
          const i = pluginHookIds.indexOf(hookId);
          if (i !== -1) pluginHookIds.splice(i, 1);
        }
        return;
      }
    }
  }

  /** Unregister all hooks for a plugin. */
  unregisterPlugin(pluginId: string): void {
    const hookIds = this.pluginHooks.get(pluginId);
    if (!hookIds) return;

    for (const registrations of this.hooks.values()) {
      const filtered = registrations.filter(r => r.pluginId !== pluginId);
      registrations.length = 0;
      registrations.push(...filtered);
    }

    this.pluginHooks.delete(pluginId);
  }

  /** Execute hooks for an event. Returns { continue, data }. */
  async execute<T>(
    event: HookEvent,
    data: T,
    options: { sessionId?: string; source: string },
  ): Promise<{ continue: boolean; data: T }> {
    if (this.inFlightEvents.has(event)) {
      return { continue: true, data };
    }

    this.inFlightEvents.add(event);
    try {
      return await this.runHandlers(event, data, options);
    } finally {
      this.inFlightEvents.delete(event);
    }
  }

  private async runHandlers<T>(
    event: HookEvent,
    data: T,
    options: { sessionId?: string; source: string },
  ): Promise<{ continue: boolean; data: T }> {
    const registrations = this.hooks.get(event) || [];
    if (registrations.length === 0) return { continue: true, data };

    let currentData = data;
    for (const reg of registrations) {
      try {
        const ctx = { event, data: currentData, sessionId: options.sessionId, timestamp: new Date(), source: options.source };
        const result = await reg.handler(ctx);

        if (result.error === undefined && result.data !== undefined) {
          currentData = result.data as T;
        }

        if (!result.continue) return { continue: false, data: currentData };
        if (result.error) throw result.error;
      } catch (error) {
        console.error(`[HookManager] Error in ${reg.pluginId} for ${event}:`, error);
      }
    }

    return { continue: true, data: currentData };
  }

  hasHooks(event: HookEvent): boolean {
    const r = this.hooks.get(event);
    return r !== undefined && r.length > 0;
  }

  getRegisteredHooks(): Record<string, { pluginId: string; priority: number }[]> {
    const result: Record<string, { pluginId: string; priority: number }[]> = {};
    for (const [event, registrations] of this.hooks.entries()) {
      result[event] = registrations.map(r => ({ pluginId: r.pluginId, priority: r.priority }));
    }
    return result;
  }
}

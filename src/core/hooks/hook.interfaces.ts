/**
 * Hook System Interfaces — central event bus for plugin integration.
 * Ported from OpenWA's hook.interfaces.ts for Bun.
 */

export type HookEvent =
  | 'session:created'
  | 'session:starting'
  | 'session:ready'
  | 'session:qr'
  | 'session:disconnected'
  | 'session:error'
  | 'session:deleted'
  | 'message:received'
  | 'message:sending'
  | 'message:sent'
  | 'message:failed'
  | 'message:ack'
  | 'webhook:before'
  | 'webhook:queued'
  | 'webhook:delivered'
  | 'webhook:after'
  | 'webhook:error';

export const KNOWN_HOOK_EVENTS: ReadonlySet<string> = new Set([
  'session:created', 'session:starting', 'session:ready', 'session:qr',
  'session:disconnected', 'session:error', 'session:deleted',
  'message:received', 'message:sending', 'message:sent', 'message:failed', 'message:ack',
  'webhook:before', 'webhook:queued', 'webhook:delivered', 'webhook:after', 'webhook:error',
]);

export function isKnownHookEvent(event: string): event is HookEvent {
  return KNOWN_HOOK_EVENTS.has(event);
}

export interface HookContext<T = unknown> {
  event: HookEvent;
  data: T;
  sessionId?: string;
  timestamp: Date;
  source: string;
}

export interface HookResult<T = unknown> {
  continue: boolean;
  data?: T;
  error?: Error;
}

export type HookHandler<T = unknown> = (ctx: HookContext<T>) => Promise<HookResult<T>>;

export interface HookRegistration {
  id: string;
  pluginId: string;
  event: HookEvent;
  handler: HookHandler;
  priority: number;
}

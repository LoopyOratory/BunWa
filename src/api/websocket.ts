import type { ServerWebSocket } from 'bun';
import { SessionManager } from '../core/manager.core';
import { WAHAEvents } from '../structures/enums.dto';
import { EventWildUnmask } from '../utils/events';
import pino from 'pino';

const log = pino({ name: 'WebSocket' });
let sessionManagerInstance: SessionManager | null = null;

export function setSessionManager(manager: SessionManager) {
  sessionManagerInstance = manager;
}

export interface WSData {
  subscription?: { unsubscribe: () => void };
  session?: string;
  events?: string[];
  url?: string;
}

type WSCtx = ServerWebSocket<WSData>;

export function createWebSocketHandler() {
  return {
    open(ws: WSCtx) {
      try {
        if (!sessionManagerInstance) {
          log.warn('WebSocket: SessionManager not initialized');
          ws.close(1011, 'Server not ready');
          return;
        }

        // Bun's websocket `open` handler does NOT receive the upgrade
        // request. The fetch handler passes the request URL via
        // `server.upgrade(req, { data })`, so read it from `ws.data`.
        const urlString = ws.data?.url || 'http://localhost/ws';
        const url = new URL(urlString);
        const sessionParam = url.searchParams.get('session') || '*';
        const eventsParam = url.searchParams.get('events') || '*';

        const events = EventWildUnmask(eventsParam) as WAHAEvents[];

        const subscription = sessionManagerInstance
          .getSessionEvents(sessionParam, events)
          .subscribe({
            next: (event) => {
              try {
                ws.send(JSON.stringify(event));
              } catch {
                // WebSocket might be closed
              }
            },
            error: (err) => {
              log.error({ err }, 'WebSocket subscription error');
            },
          });

        ws.data = ws.data || {};
        ws.data.subscription = subscription;
        ws.data.session = sessionParam;
        ws.data.events = events;
      } catch (error) {
        log.error({ err: error }, 'WebSocket open error');
        try {
          ws.close(1011, 'Internal error');
        } catch {}
      }
    },

    message(_ws: WSCtx, _message: string | Uint8Array) {
      // Client-to-server messages are not used currently
    },

    close(ws: WSCtx) {
      try {
        ws.data?.subscription?.unsubscribe();
      } catch {
        // Ignore close errors
      }
    },
  };
}

/**
 * Graceful Shutdown Service.
 * Ported from OpenWA's shutdown.service.ts (70 lines).
 * Features: draining state, bounded grace window, signal handlers.
 */

import pino from 'pino';

const log = pino({ name: 'ShutdownService' });
const DEFAULT_SHUTDOWN_DELAY_MS = 3000;
const MAX_SHUTDOWN_DELAY_MS = 30_000;

class ShutdownServiceImpl {
  private destroyCallback: (() => Promise<void>) | null = null;
  private shuttingDown = false;
  private readyCheck: (() => boolean) | null = null;

  setShutdownCallback(callback: () => Promise<void>): void {
    this.destroyCallback = callback;
  }

  setReadyCheck(check: () => boolean): void {
    this.readyCheck = check;
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  isReady(): boolean {
    if (this.shuttingDown) return false;
    return this.readyCheck ? this.readyCheck() : true;
  }

  markShuttingDown(): void {
    if (!this.shuttingDown) {
      this.shuttingDown = true;
      log.info('Entering draining state — readiness now reports 503');
    }
  }

  shutdown(delayMs?: number): void {
    this.markShuttingDown();
    const delay = Math.min(delayMs ?? DEFAULT_SHUTDOWN_DELAY_MS, MAX_SHUTDOWN_DELAY_MS);
    log.info({ delayMs: delay }, 'Graceful shutdown requested');

    setTimeout(() => {
      log.info('Initiating shutdown...');
      const doShutdown = async () => {
        try {
          if (this.destroyCallback) {
            await this.destroyCallback();
          }
        } catch (error) {
          log.error('Error during shutdown: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
          process.exit(0);
        }
      };
      void doShutdown();
    }, delay);
  }

  registerSignals(): void {
    const handler = () => {
      log.info('Received shutdown signal');
      this.shutdown();
    };
    process.on('SIGTERM', handler);
    process.on('SIGINT', handler);
  }
}

export const shutdownService = new ShutdownServiceImpl();

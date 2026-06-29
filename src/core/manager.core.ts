import { injectable, inject } from 'tsyringe';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EMPTY, merge, Observable } from 'rxjs';
import { WhatsappConfigService } from '../config.service';
import { WhatsappSession } from './abc/session.abc';
import { WhatsappSessionNoWebCore } from './engines/noweb/session.noweb.core';
import {
  WAHAEngine,
  WAHAEvents,
  WAHASessionStatus,
} from '../structures/enums.dto';
import {
  SessionConfig,
  SessionInfo,
} from '../structures/sessions.dto';
import { DefaultMap } from '../utils/DefaultMap';
import { getBrowserExecutablePath } from './abc/session.browser';
import { SwitchObservable } from '../utils/reactive/SwitchObservable';
import { NotFoundException, BadRequestException } from './exceptions';
import { LocalStoreCore } from './storage/LocalStoreCore';
import { WebhookDelivery } from './webhook-delivery';
import AsyncLock from 'async-lock';
import pino from 'pino';

const SESSIONS_DIR = join(process.cwd(), '.sessions', 'noweb');
const SESSIONS_INDEX = join(SESSIONS_DIR, '.sessions-index.json');

@injectable()
export class SessionManager {
  private sessions: Map<string, WhatsappSession> = new Map();
  private sessionConfigs: Map<string, SessionConfig> = new Map();
  private lock: any;
  private logger: any;
  private events2: DefaultMap<WAHAEvents, SwitchObservable<any>>;

  private webhook: WebhookDelivery | null = null;

  constructor(
    @inject(WhatsappConfigService) private config: WhatsappConfigService,
  ) {
    this.lock = new AsyncLock({
      timeout: 5_000,
      maxPending: Infinity,
      maxExecutionTime: 30_000,
    });
    this.logger = pino({ name: 'SessionManager' });
    this.events2 = new DefaultMap<WAHAEvents, SwitchObservable<any>>(
      (event) => new SwitchObservable<any>(),
    );
    // Initialize webhook delivery if configured
    if (config.getWebhookUrl()) {
      this.webhook = new WebhookDelivery(config);
    }
  }

  async startPredefinedSessions(): Promise<void> {
    const startSessions = this.config.startSessions;
    for (const sessionName of startSessions) {
      await this.withLock(sessionName, async () => {
        this.logger.info(`Starting predefined session: ${sessionName}`);
        await this.start(sessionName);
      });
    }
  }

  async withLock(name: string, fn: () => any): Promise<any> {
    return this.lock.acquire(name, fn);
  }

  getEngine(engine: WAHAEngine): typeof WhatsappSession {
    if (engine === WAHAEngine.WEBJS) {
      // Dynamic import so we don't load puppeteer/chrome at boot
      const { WhatsappSessionWebJs } = require('./engines/webjs/session.webjs.core');
      return WhatsappSessionWebJs;
    }
    return WhatsappSessionNoWebCore as any;
  }

  get EngineClass(): typeof WhatsappSession {
    // Default to NOWEB, session config overrides in start()
    return this.getEngine(WAHAEngine.NOWEB);
  }

  getSessionEvent(session: string, event: WAHAEvents): Observable<any> {
    // Use per-session event observable if session is specified
    if (session && session !== '*') {
      try {
        const sessionObj = this.getSession(session);
        return sessionObj.getEventObservable(event);
      } catch {
        // Session not found, return empty observable
        return EMPTY;
      }
    }
    // Wildcard subscription: merge the event observable of every known
    // session so wildcard clients (e.g. event monitor) receive events from
    // any session, even ones that are created after the subscription.
    const sessionObservables: Observable<any>[] = [];
    for (const [name, sessionObj] of this.sessions) {
      if (!sessionObj) continue;
      try {
        sessionObservables.push(sessionObj.getEventObservable(event));
      } catch {
        // Session doesn't expose this event; skip
      }
    }
    if (sessionObservables.length > 0) {
      return merge(...sessionObservables);
    }
    // Fallback to global events for wildcard subscriptions
    return this.events2.get(event);
  }

  getSessionEvents(session: string, events: WAHAEvents[]): Observable<any> {
    return merge(
      ...events.map((event) => this.getSessionEvent(session, event)),
    );
  }

  async start(name: string): Promise<any> {
    const sessionConfig = this.sessionConfigs.get(name) || {};
    // Determine engine type from config, default to NOWEB
    const engineRaw = sessionConfig?.engine || 'NOWEB';
    const engine = engineRaw.toUpperCase() === 'WEBJS' ? WAHAEngine.WEBJS : WAHAEngine.NOWEB;

    // Validate Chrome availability for webjs
    if (engine === WAHAEngine.WEBJS) {
      const chromePath = getBrowserExecutablePath();
      if (!existsSync(chromePath)) {
        throw new BadRequestException(
          'whatsapp-web.js requires Chrome/Chromium. ' +
          'Install it or set CHROME_PATH environment variable.\n' +
          `Checked: ${getBrowserExecutablePath()}`
        );
      }
    }

    const EngineClass = this.getEngine(engine);

    const logger = pino({ name: `Session.${name}` });
    const store = new LocalStoreCore();
    await store.init(name);

    const session = new EngineClass({
      name,
      printQR: true,
      mediaManager: null as any,
      loggerBuilder: {
        child: (bindings: any) => logger.child(bindings),
      } as any,
      sessionStore: store,
      proxyConfig: sessionConfig.proxy,
      sessionConfig,
      engineConfig: {},
      ignore: this.config.getIgnoreChatsConfig(),
    });

    this.sessions.set(name, session);

    // Subscribe to session events for webhook delivery
    if (this.webhook) {
      const webhookEvents = [
        WAHAEvents.SESSION_STATUS,
        WAHAEvents.MESSAGE,
        WAHAEvents.MESSAGE_ANY,
      ];
      for (const event of webhookEvents) {
        try {
          session.getEventObservable(event).subscribe({
            next: (data: any) => {
              this.webhook!.deliver({
                event,
                session: name,
                timestamp: Date.now(),
                data,
              });
            },
          });
        } catch {
          // Session doesn't support this event
        }
      }
    }

    // Start the session in background
    (session as any).start().catch((error: any) => {
      this.logger.error(`Session ${name} failed to start:`, error.message);
      this.sessions.delete(name);  // Remove ghost entry on failure
    });

    this.logger.info(`Session ${name} started`);

    return {
      name,
      status: WAHASessionStatus.STARTING,
      config: sessionConfig,
    };
  }

  async stop(name: string, silent: boolean = false): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await (session as any).stop();
      this.sessions.set(name, null as any);  // Keep entry for restart, mark as stopped
      if (!silent) {
        this.logger.info(`Session ${name} stopped`);
      }
    }
  }

  async restart(name: string): Promise<any> {
    await this.stop(name, true);
    return this.start(name);
  }

  getSession(name: string): WhatsappSession {
    const session = this.sessions.get(name);
    if (!session) {
      throw new NotFoundException(`Session ${name} not found`);
    }
    return session;
  }

  async getWorkingSession(name: string): Promise<WhatsappSession> {
    const session = this.getSession(name);
    const status = (session as any).status;
    if (status !== WAHASessionStatus.WORKING) {
      throw new NotFoundException(`Session ${name} is not working (status: ${status})`);
    }
    return session;
  }

  async getSessions(all: boolean = false): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = [];
    for (const [name, session] of this.sessions) {
      sessions.push({
        name,
        status: session ? (session as any).status || WAHASessionStatus.STOPPED : WAHASessionStatus.STOPPED,
        config: this.sessionConfigs.get(name) || {},
        presence: session ? (session as any).presence || null : null,
        timestamps: {
          activity: session?.getLastActivityTimestamp?.() || undefined,
        },
      });
    }
    return sessions;
  }

  async exists(name: string): Promise<boolean> {
    return this.sessions.has(name);
  }

  async isRunning(name: string): boolean {
    return this.sessions.has(name) && this.sessions.get(name) !== null;
  }

  async restoreSessions(): Promise<void> {
    const index = await this.loadSessionIndex();
    const shouldRestart = this.config.shouldRestartAllSessions;
    for (const [name, config] of Object.entries(index)) {
      this.sessionConfigs.set(name, config as SessionConfig);
      if (!this.sessions.has(name)) {
        this.sessions.set(name, null as any);  // Mark as stopped, ready to start
      }
    }
    this.logger.info(`Restored ${Object.keys(index).length} sessions from disk`);
    if (shouldRestart) {
      for (const [name] of Object.entries(index)) {
        if (this.sessions.get(name) !== null) {
          continue;
        }
        this.logger.info(`Auto-starting session: ${name}`);
        try {
          await this.start(name);
        } catch (err) {
          this.logger.error(
            `Failed to auto-start session ${name}: ${err.message}`,
          );
        }
      }
    }
  }

  private async saveSessionIndex(): Promise<void> {
    const index: Record<string, any> = {};
    for (const [name, config] of this.sessionConfigs) {
      index[name] = { ...config };
    }
    // Also include sessions that exist but have no config
    for (const [name, session] of this.sessions) {
      if (!index[name]) {
        index[name] = {};
      }
      // Save the current status so we can restore it
      if (session) {
        index[name]._status = (session as any).status || 'STOPPED';
      } else {
        index[name]._status = 'STOPPED';
      }
    }
    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
    }
    await Bun.write(SESSIONS_INDEX, JSON.stringify(index, null, 2));
  }

  private async loadSessionIndex(): Promise<Record<string, SessionConfig>> {
    if (!existsSync(SESSIONS_INDEX)) {
      return {};
    }
    try {
      const file = Bun.file(SESSIONS_INDEX);
      const content = await file.text();
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Validate session name — reject names that could cause path traversal
   * or other security issues.
   */
  private validateSessionName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new BadRequestException('Session name is required');
    }
    if (name.length > 64) {
      throw new BadRequestException('Session name must be 64 characters or less');
    }
    // Reject path traversal and filesystem-unsafe characters
    if (/[/\\:*?"<>|.\s]/.test(name)) {
      throw new BadRequestException(
        'Session name contains invalid characters (no spaces, dots, slashes, or special chars)'
      );
    }
    if (name === '.' || name === '..') {
      throw new BadRequestException('Session name cannot be . or ..');
    }
  }

  async upsert(name: string, config?: SessionConfig): Promise<void> {
    this.validateSessionName(name);
    if (config) {
      this.sessionConfigs.set(name, config);
    }
    if (!this.sessions.has(name)) {
      this.sessions.set(name, null as any);
    }
    await this.saveSessionIndex();
  }

  async delete(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await this.stop(name, true);
    }
    this.sessions.delete(name);
    this.sessionConfigs.delete(name);
    await this.saveSessionIndex();
  }

  async logout(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await (session as any).logout?.();
    }
    await this.delete(name);
  }

  async unpair(name: string): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await (session as any).unpair?.();
    }
    await this.delete(name);
  }
}

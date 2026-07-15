import { injectable, inject, container } from 'tsyringe';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { EMPTY, merge, Observable, map } from 'rxjs';
import { WhatsappConfigService } from '../config.service';
import { WhatsappSession } from './session/session.abc';
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
import { getBrowserExecutablePath } from './session/session.browser';
import { SwitchObservable } from '../utils/reactive/SwitchObservable';
import { NotFoundException, BadRequestException } from './exceptions';
import { LocalStoreCore } from './storage/LocalStoreCore';
import { WebhookDelivery } from './webhook-delivery';
import { AuditService, AuditAction } from './audit/audit.service';
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
  private subscriptions: Map<string, Array<{ unsubscribe: () => void }>> = new Map();
  private auditService: AuditService | null = null;

  /** Lazily resolved: AuditService is registered in the DI container after
   *  SessionManager is constructed (see di/container.ts), so it can't be
   *  taken as a constructor dependency. */
  private get audit(): AuditService {
    if (!this.auditService) {
      this.auditService = container.resolve(AuditService);
    }
    return this.auditService;
  }

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
    // Always initialize webhook delivery: per-session webhooks carry their own
    // URL, so delivery must work even when the global WEBHOOK_URL is unset.
    // (deliver() no-ops gracefully when neither a per-call nor global URL exists.)
    this.webhook = new WebhookDelivery(config);
  }

  async startPredefinedSessions(): Promise<void> {
    const startSessions = this.config.startSessions;
    for (const sessionName of startSessions) {
      await this.withLock(sessionName, async () => {
        this.logger.info(`Starting predefined session: ${sessionName}`);
        await this._start(sessionName);
      });
    }
  }

  async withLock(name: string, fn: () => any): Promise<any> {
    return this.lock.acquire(name, fn);
  }

  getEngine(engine: WAHAEngine): new (...args: any[]) => WhatsappSession {
    if (engine === WAHAEngine.WEBJS) {
      // Dynamic import so we don't load puppeteer/chrome at boot
      const { WhatsappSessionWebJs } = require('./engines/webjs/session.webjs.core');
      return WhatsappSessionWebJs;
    }
    return WhatsappSessionNoWebCore as any;
  }

  get EngineClass(): new (...args: any[]) => WhatsappSession {
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
    // Wildcard subscription: `events2.get(event)` returns a long-lived
    // SwitchObservable shared by every wildcard subscriber. Refresh it now
    // so a brand-new subscriber immediately sees the current session set,
    // and refresh it again whenever sessions start/stop (see
    // refreshAllWildcardEvents) so already-connected subscribers keep
    // receiving events from sessions started/stopped after they connected.
    const observable = this.events2.get(event);
    this.refreshWildcardEvent(event);
    return observable;
  }

  getSessionEvents(session: string, events: WAHAEvents[]): Observable<any> {
    // Tag each event with its type/session before merging: the underlying
    // per-event observables (WAMessage, WAMessageAck, WAMessageReaction,
    // session-status payloads, etc.) carry no self-describing "event" field,
    // so once multiple event types are merged into one stream, consumers
    // (Event Monitor, Chat page) have no way to tell them apart without it.
    return merge(
      ...events.map((event) =>
        this.getSessionEvent(session, event).pipe(
          map((payload) => ({ event, session, payload, timestamp: Date.now() })),
        ),
      ),
    );
  }

  /**
   * Build the merged observable of every currently-running session's event
   * stream for a single event type. Used to (re)populate the wildcard
   * SwitchObservable in `events2`.
   */
  private computeWildcardMerge(event: WAHAEvents): Observable<any> {
    const sessionObservables: Observable<any>[] = [];
    for (const [, sessionObj] of this.sessions) {
      if (!sessionObj) continue;
      try {
        sessionObservables.push(sessionObj.getEventObservable(event));
      } catch {
        // Session doesn't expose this event; skip
      }
    }
    return sessionObservables.length > 0 ? merge(...sessionObservables) : EMPTY;
  }

  /**
   * Re-point the wildcard SwitchObservable for a single event type at a
   * fresh merge of currently-running sessions. No-ops if nobody has ever
   * subscribed to this event via the wildcard path (avoids creating
   * unnecessary SwitchObservable instances).
   */
  private refreshWildcardEvent(event: WAHAEvents): void {
    if (!this.events2.has(event)) return;
    this.events2.get(event).switch(this.computeWildcardMerge(event));
  }

  /**
   * Refresh every wildcard event stream that currently has at least one
   * subscriber. Call this whenever the running-session set changes (a
   * session starts, stops, or is removed) so live wildcard subscribers
   * (e.g. the Event Monitor) keep receiving events from sessions that
   * didn't exist yet when they connected.
   */
  private refreshAllWildcardEvents(): void {
    for (const event of this.events2.keys()) {
      this.refreshWildcardEvent(event);
    }
  }

  async start(name: string): Promise<any> {
    return this.withLock(name, () => this._start(name));
  }

  private async _start(name: string): Promise<any> {
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
    this.refreshAllWildcardEvents();
    this.audit.logInfo(AuditAction.SESSION_STARTED, { sessionName: name });

    // Collect all subscriptions for this session for later resync/cleanup
    const sessionSubs: Array<{ unsubscribe: () => void }> = [];

    // Track status transitions for connect/disconnect/QR audit events
    let previousStatus: WAHASessionStatus | null = null;
    try {
      const statusSub = session.getEventObservable(WAHAEvents.SESSION_STATUS).subscribe({
        next: (data: any) => {
          const status = data?.status as WAHASessionStatus | undefined;
          if (!status) return;
          if (status === WAHASessionStatus.SCAN_QR_CODE) {
            this.audit.logInfo(AuditAction.SESSION_QR_GENERATED, { sessionName: name });
          } else if (status === WAHASessionStatus.WORKING) {
            this.audit.logInfo(AuditAction.SESSION_CONNECTED, { sessionName: name });
          } else if (previousStatus === WAHASessionStatus.WORKING) {
            this.audit.logWarn(AuditAction.SESSION_DISCONNECTED, { sessionName: name });
          }
          previousStatus = status;
        },
      });
      sessionSubs.push(statusSub);
    } catch {
      // Session doesn't support this event
    }

    // Subscribe to session events for webhook delivery (global env-config webhook)
    this.subscribeGlobalWebhooks(name, session, sessionSubs);

    // Per-session webhooks (from session config)
    const sessionWebhooks = sessionConfig.webhooks || [];
    for (const wh of sessionWebhooks) {
      if (wh.enabled === false || !wh.url) continue;

      const deliveryConfig = {
        url: wh.url,
        method: wh.method,
        secret: wh.hmac?.key,
        retries: wh.retries?.attempts ?? 3,
        retryDelayMs: (wh.retries?.delaySeconds ?? 2) * 1000,
        customHeaders: wh.customHeaders?.reduce((acc: Record<string, string>, h: any) => {
          acc[h.name] = h.value;
          return acc;
        }, {}),
        filters: wh.filters,
      };

      // Determine which events to subscribe to from the webhook config
      const allEvents = Object.values(WAHAEvents);
      const webhookEvents = wh.events.includes('*')
        ? allEvents
        : allEvents.filter(e => wh.events.includes(e));

      for (const event of webhookEvents) {
        try {
          const sub = session.getEventObservable(event).subscribe({
            next: (data: any) => {
              this.webhook!.deliver({
                event,
                session: name,
                timestamp: Date.now(),
                data,
              }, deliveryConfig);
            },
          });
          sessionSubs.push(sub);
        } catch {
          // Session doesn't support this event
        }
      }
    }

    // Store subscriptions for later resync/cleanup
    this.subscriptions.set(name, sessionSubs);

    // Start the session in background
    (session as any).start().catch((error: any) => {
      this.logger.error(`Session ${name} failed to start:`, error.stack || error.message);
      this.audit.logError(AuditAction.SESSION_STOPPED, {
        sessionName: name,
        errorMessage: error?.message || String(error),
      });
      // Only remove from map if it's still the same session (avoid race)
      if (this.sessions.get(name) === session) {
        this.sessions.delete(name);
        this.refreshAllWildcardEvents();
      }
    });

    this.logger.info(`Session ${name} started`);

    return {
      name,
      status: WAHASessionStatus.STARTING,
      config: sessionConfig,
    };
  }

  async stop(name: string, silent: boolean = false): Promise<void> {
    return this.withLock(name, () => this._stop(name, silent));
  }

  private async _stop(name: string, silent: boolean = false): Promise<void> {
    const session = this.sessions.get(name);
    if (session) {
      await (session as any).stop();
      this.sessions.set(name, null as any);
      this.refreshAllWildcardEvents();
      if (!silent) {
        this.logger.info(`Session ${name} stopped`);
        this.audit.logInfo(AuditAction.SESSION_STOPPED, { sessionName: name });
      }
    }
  }

  async restart(name: string): Promise<any> {
    return this.withLock(name, async () => {
      await this._stop(name, true);
      return this._start(name);
    });
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

  getSessionConfig(name: string): SessionConfig | undefined {
    return this.sessionConfigs.get(name);
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

  isRunning(name: string): boolean {
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
    for (const [name, config] of Object.entries(index)) {
      // Start on boot when the global flag is set (restart all) or the
      // session has per-session auto-start enabled in its config.
      const autoStart = shouldRestart || (config as SessionConfig)?.autoStart === true;
      if (!autoStart) {
        continue;
      }
      if (this.sessions.get(name) !== null) {
        continue;
      }
      this.logger.info(`Auto-starting session: ${name}`);
      try {
        await this.start(name);
      } catch (err: any) {
        this.logger.error(
          `Failed to auto-start session ${name}: ${err.message}`,
        );
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
      // Preserve the server-managed per-session MCP key hash across full
      // config replacements. The dashboard settings form rebuilds `config`
      // from scratch and never echoes back `mcp.apiKeyHash`, so without this
      // guard any settings save (or a config-carrying restart) would silently
      // wipe the generated MCP key and force the user to regenerate it.
      const existingHash = this.sessionConfigs.get(name)?.mcp?.apiKeyHash;
      if (existingHash && !config.mcp?.apiKeyHash) {
        config = { ...config, mcp: { ...(config.mcp || {}), apiKeyHash: existingHash } };
      }
      this.sessionConfigs.set(name, config);
    }
    if (!this.sessions.has(name)) {
      this.sessions.set(name, null as any);
      this.audit.logInfo(AuditAction.SESSION_CREATED, { sessionName: name });
    }
    await this.saveSessionIndex();
  }

  async delete(name: string): Promise<void> {
    return this.withLock(name, async () => {
      const session = this.sessions.get(name);
      if (session) {
        await this._stop(name, true);
      }
      this.sessions.delete(name);
      this.sessionConfigs.delete(name);
      await this.saveSessionIndex();
      this.audit.logInfo(AuditAction.SESSION_DELETED, { sessionName: name });
    });
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
    this.audit.logWarn(AuditAction.SESSION_FORCE_KILLED, { sessionName: name });
    await this.delete(name);
  }

  /**
   * Resubscribe all webhook subscriptions for a session.
   * Unsubscribes existing ones first, then re-creates based on current config.
   * Called from webhook CRUD routes after create/update/delete.
   */
  /**
   * Subscribe to the common events delivered to the global env-configured
   * webhook (WEBHOOK_URL). Pushes the created subscriptions onto `sink` so the
   * caller can track them for later resync/cleanup. No-op when no global
   * webhook is configured. Shared by _start and resyncWebhooks so a resync
   * restores the global subscriptions it tears down.
   */
  private subscribeGlobalWebhooks(
    name: string,
    session: WhatsappSession,
    sink: Array<{ unsubscribe: () => void }>,
  ): void {
    if (!this.webhook) return;

    const globalEvents = [
      WAHAEvents.SESSION_STATUS,
      WAHAEvents.MESSAGE,
      WAHAEvents.MESSAGE_ANY,
    ];
    for (const event of globalEvents) {
      try {
        const sub = session.getEventObservable(event).subscribe({
          next: (data: any) => {
            this.webhook!.deliver({
              event,
              session: name,
              timestamp: Date.now(),
              data,
            });
          },
        });
        sink.push(sub);
      } catch {
        // Session doesn't support this event
      }
    }
  }

  async resyncWebhooks(name: string): Promise<void> {
    // Unsubscribe all existing subscriptions for this session
    const existing = this.subscriptions.get(name);
    if (existing) {
      for (const sub of existing) {
        try { sub.unsubscribe(); } catch { /* ignore */ }
      }
    }
    this.subscriptions.delete(name);

    // Re-subscribe only if the session is still active
    const session = this.sessions.get(name);
    if (!session || !this.webhook) return;

    const sessionSubs: Array<{ unsubscribe: () => void }> = [];

    // Restore the global env-config webhook subscriptions we just tore down
    this.subscribeGlobalWebhooks(name, session, sessionSubs);

    const sessionConfig = this.sessionConfigs.get(name) || {};
    const sessionWebhooks = sessionConfig.webhooks || [];

    for (const wh of sessionWebhooks) {
      if (wh.enabled === false || !wh.url) continue;

      const deliveryConfig = {
        url: wh.url,
        method: wh.method,
        secret: wh.hmac?.key,
        retries: wh.retries?.attempts ?? 3,
        retryDelayMs: (wh.retries?.delaySeconds ?? 2) * 1000,
        customHeaders: wh.customHeaders?.reduce((acc: Record<string, string>, h: any) => {
          acc[h.name] = h.value;
          return acc;
        }, {}),
        filters: wh.filters,
      };

      const allEvents = Object.values(WAHAEvents);
      const webhookEvents = wh.events.includes('*')
        ? allEvents
        : allEvents.filter(e => wh.events.includes(e));

      for (const event of webhookEvents) {
        try {
          const sub = session.getEventObservable(event).subscribe({
            next: (data: any) => {
              this.webhook!.deliver({
                event,
                session: name,
                timestamp: Date.now(),
                data,
              }, deliveryConfig);
            },
          });
          sessionSubs.push(sub);
        } catch {
          // Session doesn't support this event
        }
      }
    }

    if (sessionSubs.length > 0) {
      this.subscriptions.set(name, sessionSubs);
    }
  }
}

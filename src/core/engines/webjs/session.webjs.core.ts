/**
 * whatsapp-web.js Session for BunWa
 *
 * Extends WhatsappSession (the same base class used by BUNWEB/Baileys) and
 * implements all abstract methods using whatsapp-web.js backed by Puppeteer/Chrome.
 *
 * This is Path A from the wiring plan — a proper session class that reuses all
 * the existing session infrastructure (events, webhooks, status tracking, store).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Client,
  LocalAuth,
  MessageMedia,
  WAState,
} from 'whatsapp-web.js';
import * as wwebjsRuntime from 'whatsapp-web.js';
import { WebJSCallController, CallInfo, StartCallOptions, CallAudioChunk } from './calls.webjs';
import { TtlCache } from '../../../utils/ttl-cache';
import { Subject } from 'rxjs';
import {
  ChatRequest,
  CheckNumberStatusQuery,
  MessageFileRequest,
  MessageForwardRequest,
  MessageImageRequest,
  MessageLocationRequest,
  MessageReactionRequest,
  MessageReplyRequest,
  MessageTextRequest,
  MessageVideoRequest,
  MessageVoiceRequest,
  SendSeenRequest,
  WANumberExistResult,
} from '../../../structures/chatting.dto';
import {
  ContactQuery,
  ContactRequest,
} from '../../../structures/contacts.dto';
import {
  BUNWAEngine,
  BUNWAEvents,
  BUNWAPresenceStatus,
  BUNWASessionStatus,
} from '../../../structures/enums.dto';
import { BinaryFile, RemoteFile } from '../../../structures/files.dto';
import {
  CreateGroupRequest,
  GroupInfo,
  GroupParticipant,
  ParticipantsRequest,
} from '../../../structures/groups.dto';
import {
  PaginationParams,
} from '../../../structures/pagination.dto';
import {
  WAMessage,
} from '../../../structures/responses.dto';
import { MeInfo } from '../../../structures/sessions.dto';
import { QR } from '../../QR';
import {
  GetChatMessageQuery,
  GetChatMessagesFilter,
  GetChatMessagesQuery,
  ReadChatMessagesQuery,
  ReadChatMessagesResponse,
} from '../../../structures/chats.dto';
import { WhatsappSession } from '../../session/session.abc';
import { getBrowserExecutablePath } from '../../session/session.browser';
import {
  BadRequestException,
  NotImplementedByEngineError,
  NotFoundException,
  PairingRateLimitedException,
  UnprocessableEntityException,
} from '../../exceptions';
import { fetchBuffer } from '../../../utils/fetch';
import { isUsernameAddress } from '../../../common/security/wa-id';
import { WAMessageAck } from '../../utils/acks';
import {
  UNSUPPORTED_FILE_INPUT,
  readMediaFile,
  resolveMediaInput,
} from '../../media/media-input';
import {
  formatPairingCode,
  mapWwebjsMessageType,
  splitProxyConfig,
  toGroupParticipant,
  toWebjsParticipantId,
} from './webjs.mappers';
import { WebJSMediaProcessor } from './webjs.media-processor';

// ---------------------------------------------------------------------------
// Chrome path — resolved at launch time by the shared browser-path helper
// (CHROME_PATH → PUPPETEER_EXECUTABLE_PATH → system candidates).
// ---------------------------------------------------------------------------
const WEBJS_SESSIONS_DIR = path.join(process.cwd(), '.sessions', 'webjs');

// ---------------------------------------------------------------------------
// WhatsApp Web version pinning
//
// whatsapp-web.js works by requiring internal webpack modules out of the
// WhatsApp Web bundle (`WAWebSocketModel`, `WAWebAltDeviceLinkingApi`, ...).
// Those module names change between WhatsApp Web releases. When the library
// loads the *live* build and it ships a rename, `inject()` never resolves
// ("Waiting failed: 30000ms exceeded") and code pairing dies with
// CompanionHelloError — a failure that looks like a network or login problem
// but is really a version mismatch.
//
// Pin a build the bundled library is known to work with, and make sure its
// index.html is in the local cache. Override with WEBJS_WEB_VERSION.
// ---------------------------------------------------------------------------
const WWEBJS_PINNED_VERSION = '2.3000.1055802486';
const WWEBJS_CACHE_DIR = path.resolve(
  process.env.WWEBJS_CACHE_DIR || path.join(process.cwd(), '.wwebjs_cache'),
);

/**
 * Chrome keeps a service-worker copy of the WhatsApp Web app inside the
 * profile. After a long session that copy can silently upgrade to the live
 * build, and on the next start the service worker serves it *instead of* the
 * pinned HTML — `inject()` then times out again even though `<version>.html`
 * is on disk.
 *
 * WhatsApp's login lives in Local Storage and IndexedDB, so only the code and
 * HTTP caches are removed. Called before the browser launches (profile unlocked).
 */
async function purgeWebBuildCaches(sessionDir: string, logger: any): Promise<void> {
  const profile = path.join(sessionDir, 'Default');
  for (const dir of ['Service Worker', 'Cache', 'Code Cache']) {
    try {
      await fs.promises.rm(path.join(profile, dir), { recursive: true, force: true });
    } catch (err: any) {
      logger?.warn?.({ err, dir }, 'Could not clear the WhatsApp Web cache');
    }
  }
}

/**
 * Ensure `<version>.html` exists in the local web-version cache.
 * Returns the cache directory when the file is usable, otherwise null
 * (caller then boots without pinning — degraded, but not fatal).
 */
async function ensureWebVersionCache(version: string): Promise<string | null> {
  const file = path.join(WWEBJS_CACHE_DIR, `${version}.html`);
  try {
    const stat = await fs.promises.stat(file);
    if (stat.size > 100_000) return WWEBJS_CACHE_DIR;
  } catch {
    // not cached yet
  }

  await fs.promises.mkdir(WWEBJS_CACHE_DIR, { recursive: true });

  // The wppconnect archive publishes both plain and `-alpha` file names
  // depending on the build channel.
  for (const suffix of ['', '-alpha']) {
    const url =
      `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/` +
      `${version}${suffix}.html`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 100_000) continue;
      await fs.promises.writeFile(file, html);
      return WWEBJS_CACHE_DIR;
    } catch {
      // try the next candidate name
    }
  }

  return null;
}

/**
 * The current WhatsApp Web build exposes a message key's serialized form as
 * `$1` and not `_serialized`, while whatsapp-web.js stores the raw model id on
 * Message instances untouched. Library methods that address a message by
 * `this.id._serialized` (delete, forward, reply quoting, media download) then
 * pass undefined and fail. Normalize the serialized form once per instance.
 */
function installMessageIdShim(): void {
  const messageClass = (wwebjsRuntime as any).Message;
  if (!messageClass || messageClass.__bunwaSerializedIdShim) return;
  const originalPatch = messageClass.prototype._patch;
  messageClass.prototype._patch = function (data: any) {
    originalPatch.call(this, data);
    const id = this.id;
    if (id && typeof id === 'object' && !id._serialized) {
      if (id.$1) id._serialized = id.$1;
      else if (id.id) id._serialized = `${id.fromMe}_${id.remote}_${id.id}`;
    }
  };
  messageClass.__bunwaSerializedIdShim = true;
}
installMessageIdShim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Session class
// ---------------------------------------------------------------------------
export class WhatsappSessionWebJs extends WhatsappSession {
  engine = BUNWAEngine.WEBJS;

  private client: Client | null = null;
  /** Last presence state seen per chat id (WEBJS has no presence store). */
  private presences = new Map<string, string>();
  private qr: QR = new QR();
  private meInfo: MeInfo | null = null;
  private profilePicture: TtlCache<string | null> = new TtlCache({ stdTtl: 24 * 60 * 60 });
  private readyReconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private readyReconcileStartedAt = 0;
  /**
   * whatsapp-web.js emits both `message` and `message_create` for the same
   * inbound message. The engine mirrors the handler on purpose (some LID chats
   * only emit one of the two), so ids are deduped here — BUNWEB does the same
   * with DistinctMessages(). Without it every webhook and WS client sees the
   * message twice.
   */
  private seenMessageIds = new TtlCache<boolean>({ stdTtl: 300, checkperiod: 60 });
  private authTimeout?: number;
  private calls: WebJSCallController | null = null;

  // RxJS Subjects for bridging whatsapp-web.js events → WAHA event observables
  private eventSubjects: Map<BUNWAEvents, Subject<any>> = new Map();

  public constructor(config: any) {
    super(config);
    this.logger = this.loggerBuilder.child({ name: 'WebJsSession' });
  }

  private getEventSubject(event: BUNWAEvents): Subject<any> {
    if (!this.eventSubjects.has(event)) {
      const subject = new Subject<any>();
      this.events2.get(event).switch(subject);
      this.eventSubjects.set(event, subject);
    }
    return this.eventSubjects.get(event)!;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  async start() {
    this.status = BUNWASessionStatus.STARTING;
    this.logger.info('Starting whatsapp-web.js session...');
    // A stopped session can be started again; the dedupe cache is closed by
    // stop(), so build a fresh one for this run.
    this.seenMessageIds = new TtlCache<boolean>({ stdTtl: 300, checkperiod: 60 });

    // Ensure sessions directory exists
    if (!fs.existsSync(WEBJS_SESSIONS_DIR)) {
      fs.mkdirSync(WEBJS_SESSIONS_DIR, { recursive: true });
    }

    try {
      await this.buildClient();
      // `ready` is the normal path, but it can be missed when the page
      // reconnects before the handler is attached. Reconcile once the client
      // reports an identity so the session does not sit in STARTING forever.
      this.scheduleReadyReconcile();
    } catch (err: any) {
      this.logger.error({ err }, 'Failed to start whatsapp-web.js client');
      this.status = BUNWASessionStatus.FAILED;
    }
  }

  private async buildClient(): Promise<void> {
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-sync',
      // Additional memory optimizations (verified: ~150-300MB savings)
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-client-side-phishing-detection',
      '--disable-renderer-backgrounding',
      '--disable-site-isolation-trials',
      '--aggressive-cache-discard',
      '--js-flags=--max-old-space-size=256',
      // Calls need a running audio graph and a microphone permission that does
      // not depend on a user gesture. The mic itself is injected through
      // WAGetUserMedia by calls.webjs.ts, so no fake capture device is used.
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--window-size=1280,720',
    ];

    // Diagnostic escape hatch: let Chromium provide a known-good microphone
    // from a WAV file instead of the injected WebAudio track. If the callee
    // hears this, the call media path is healthy and the synthetic track is
    // the problem.
    if (process.env.WEBJS_FAKE_AUDIO_FILE) {
      puppeteerArgs.push('--use-fake-device-for-media-stream');
      puppeteerArgs.push(`--use-file-for-fake-audio-capture=${process.env.WEBJS_FAKE_AUDIO_FILE}`);
    }

    // Add proxy if configured. Credentials go through page.authenticate
    // (proxyAuthentication) instead of being left in the flag, which Chromium
    // ignores.
    let proxyAuthentication: { username: string; password: string } | undefined;
    if (this.proxyConfig?.server) {
      const proxy = splitProxyConfig(this.proxyConfig);
      puppeteerArgs.push(`--proxy-server=${proxy.server}`);
      proxyAuthentication = proxy.authentication;
      this.logger.info(
        `Using proxy: ${proxy.server}${proxyAuthentication ? ' (authenticated)' : ''}`,
      );
    }

    if (this.sessionConfig?.webjs?.authTimeout) {
      this.authTimeout = this.sessionConfig.webjs.authTimeout;
    }

    // Pin the WhatsApp Web build (see ensureWebVersionCache above). Without
    // this the library loads the live build, inject() times out and code
    // pairing fails with CompanionHelloError.
    const webVersion = process.env.WEBJS_WEB_VERSION || WWEBJS_PINNED_VERSION;
    const webVersionCacheDir = await ensureWebVersionCache(webVersion);
    if (webVersionCacheDir) {
      // The HTML pin only decides what the browser is *served*. A service
      // worker left by a previous run can still hand the page the live build,
      // which is exactly the state that breaks inject() and code pairing.
      await purgeWebBuildCaches(
        path.join(WEBJS_SESSIONS_DIR, `session-${this.name}`),
        this.logger,
      );
    } else {
      this.logger.warn(
        { webVersion },
        'WhatsApp Web version pin unavailable — falling back to the live build; ' +
          'code pairing may fail if WhatsApp shipped an incompatible release',
      );
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.name,
        dataPath: path.resolve(WEBJS_SESSIONS_DIR),
      }),
      ...(webVersionCacheDir
        ? {
            webVersion,
            webVersionCache: {
              type: 'local' as const,
              path: webVersionCacheDir,
              strict: true,
            },
          }
        : {}),
      puppeteer: {
        headless: true,
        args: puppeteerArgs,
        // Puppeteer's headless defaults include --mute-audio, which silences
        // WhatsApp's remote call audio before it reaches wa_out.
        ignoreDefaultArgs: ['--mute-audio'],
        executablePath: getBrowserExecutablePath(),
      },
      ...(this.authTimeout ? { authTimeoutMs: this.authTimeout } : {}),
      ...(proxyAuthentication ? { proxyAuthentication } : {}),
    });

    this.setupEventHandlers();
    await this.client.initialize();
  }

  /**
   * Single inbound path for both `message` and `message_create`.
   *
   * webjs emits both for an inbound message, and the engine listens to both
   * because some LID-addressed chats only fire one of them. Dedupe by message
   * id so downstream consumers (webhooks, WS, chat runtime) see one event.
   */
  private async emitInbound(msg: any): Promise<void> {
    if (!this.jids.include(msg.fromMe ? msg.to : msg.from)) return;
    try {
      const waMsg = this.mapIncomingMessage(msg);
      if (waMsg.id) {
        if (this.seenMessageIds.has(waMsg.id)) return;
        this.seenMessageIds.set(waMsg.id, true);
      }

      // Attach sender contact info. In a group `from` must stay the group
      // (it is the chat); the person is `author`.
      try {
        const contact = await msg.getContact();
        const contactId = contact?.id?._serialized;
        if (contactId) {
          if (String(waMsg.from).endsWith('@g.us')) waMsg.author = contactId;
          else waMsg.from = contactId;
        }
      } catch {}

      await this.attachMedia(msg, waMsg);

      this.getEventSubject(BUNWAEvents.MESSAGE).next(waMsg);
      // message.any carries every message, incoming included (as on BUNWEB).
      this.getEventSubject(BUNWAEvents.MESSAGE_ANY).next(waMsg);
      this.maintainPresenceOnline();
    } catch (err) {
      this.logger.error({ err }, 'Error processing incoming message');
    }
  }

  /**
   * Download and store an inbound attachment, then publish it on the normalized
   * message (`media` object + `mediaUrl`), matching BUNWEB. Failures never drop
   * the message: the metadata is still delivered.
   */
  private async attachMedia(msg: any, waMsg: any): Promise<void> {
    if (!waMsg?.hasMedia || !msg?.hasMedia) return;
    try {
      const media = await this.mediaManager?.processMedia(
        new WebJSMediaProcessor(),
        msg,
        this.name,
      );
      if (media) {
        waMsg.media = media;
        waMsg.mediaUrl = media.url;
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to store inbound WEBJS media');
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    const status$ = this.getEventSubject(BUNWAEvents.SESSION_STATUS);
    const msg$ = this.getEventSubject(BUNWAEvents.MESSAGE);
    const msgAny$ = this.getEventSubject(BUNWAEvents.MESSAGE_ANY);
    const msgAck$ = this.getEventSubject(BUNWAEvents.MESSAGE_ACK);
    const groupJoin$ = this.getEventSubject(BUNWAEvents.GROUP_JOIN);
    const groupLeave$ = this.getEventSubject(BUNWAEvents.GROUP_LEAVE);
    const presence$ = this.getEventSubject(BUNWAEvents.PRESENCE_UPDATE);

    this.client.on('qr', async (qrRaw: string) => {
      try {
        this.qr.save(qrRaw);
        this.status = BUNWASessionStatus.SCAN_QR_CODE;
        this.printQR(this.qr);
        this.logger.info('QR code received — scan with WhatsApp');
        status$.next({
          status: BUNWASessionStatus.SCAN_QR_CODE,
          qr: await this.qr.get(),
        });
      } catch (err) {
        this.logger.error({ err }, 'Error handling QR');
      }
    });

    this.client.on('authenticated', () => {
      this.logger.info('Authenticated successfully');
      if (this.status !== BUNWASessionStatus.WORKING &&
          this.status !== BUNWASessionStatus.FAILED) {
        this.status = BUNWASessionStatus.STARTING;
      }
    });

    this.client.on('auth_failure', (msg: string) => {
      this.logger.error({ msg }, 'Auth failure');
      this.status = BUNWASessionStatus.FAILED;
    });

    this.client.on('ready', async () => {
      this.logger.info('Client ready — session is WORKING');
      // A shim failure must never leave a genuinely connected session stuck in
      // STARTING: mark ready in `finally` and log what failed.
      try {
        await this.installChatModelShim();
      } catch (err) {
        this.logger.warn({ err }, 'Failed to install the chat-model shim');
      }
      try {
        await this.installCalls();
      } catch (err) {
        this.logger.warn({ err }, 'Failed to install the call controller');
      } finally {
        this.markReady();
      }
    });

    // WhatsApp Web can reload the page (for example after a version change),
    // which drops the injected shim; reinstall it once the page reconnects.
    this.client.on('change_state', (state: string) => {
      if (state === 'CONNECTED' && this.status === BUNWASessionStatus.WORKING) {
        void this.installChatModelShim().catch((err) =>
          this.logger.warn({ err }, 'Failed to reinstall the chat-model shim'),
        );
        void this.installCalls().catch((err) =>
          this.logger.warn({ err }, 'Failed to reinstall the call controller'),
        );
      }
    });

    this.client.on('disconnected', (reason: WAState) => {
      this.logger.warn(`Disconnected: ${reason}`);
      if (this.status === BUNWASessionStatus.WORKING) {
        this.status = BUNWASessionStatus.FAILED;
      }
    });

    // Incoming calls (WEBJS exposes these as `call` events). Outgoing calls are
    // tracked by the call controller and the REST/MCP surface.
    this.client.on('call', (call: any) => {
      try {
        this.getEventSubject(BUNWAEvents.CALL_RECEIVED).next({
          id: call?.id,
          from: call?.from,
          isVideo: !!call?.isVideo,
          isGroup: !!call?.isGroup,
          timestamp: call?.timestamp,
          fromMe: !!call?.fromMe,
        });
      } catch (err) {
        this.logger.warn({ err }, 'Failed to emit call.received');
      }
    });

    // Incoming messages
    this.client.on('message', (msg: any) => {
      void this.emitInbound(msg);
    });

    // Outgoing messages (from me) and incoming fallback (when the 'message'
    // event does not fire for LID-addressed chats).
    this.client.on('message_create', (msg: any) => {
      if (msg.fromMe) {
        if (!this.jids.include(msg.to)) return;
        const waMsg = this.mapIncomingMessage(msg);
        msgAny$.next(waMsg);
        return;
      }
      // Incoming: mirror the 'message' handler so the chat runtime still
      // triggers when webjs does not emit 'message' for this chat.
      void this.emitInbound(msg);
    });

    // Message acknowledgements. The payload matches BUNWEB's
    // WAMessageAckBody: consumers read `ackName`, and a bare `status` string
    // (the previous shape) was invisible to them.
    this.client.on('message_ack', (msg: any, ack: number) => {
      if (!this.jids.include(msg.fromMe ? msg.to : msg.from)) return;
      const numericAck = Number.isFinite(ack) ? ack : WAMessageAck.PENDING;
      msgAck$.next({
        id: this.messageIdSerialized(msg.id),
        from: msg.from || '',
        to: msg.to || '',
        participant: msg.fromMe ? undefined : msg.from,
        fromMe: Boolean(msg.fromMe),
        ack: numericAck,
        ackName: WAMessageAck[numericAck] || 'UNKNOWN',
        timestamp: Date.now(),
      });
    });

    // Group join
    this.client.on('group_join', (notification: any) => {
      groupJoin$.next({
        id: notification.id._serialized,
        recipientIds: notification.recipientIds || [],
        timestamp: Date.now(),
      });
    });

    // Group leave
    this.client.on('group_leave', (notification: any) => {
      groupLeave$.next({
        id: notification.id._serialized,
        recipientIds: notification.recipientIds || [],
        timestamp: Date.now(),
      });
    });

    // Presence updates
    this.client.on('presence_changed', (presence: any) => {
      const id = presence.id?._serialized || presence.id || '';
      const state = presence.state || 'unavailable';
      if (id) this.presences.set(id, state);
      presence$.next({
        id,
        presence: state,
        timestamp: Date.now(),
      });
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping whatsapp-web.js session...');
    this.clearReadyReconcile();
    this.seenMessageIds.close();
    if (!this.client) {
      this.status = BUNWASessionStatus.STOPPED;
      return;
    }
    try {
      await this.client.destroy();
    } catch (err) {
      this.logger.warn({ err }, 'Error destroying client');
    } finally {
      this.client = null;
      this.qr = new QR();
      this.presences.clear();
      this.meInfo = null;
      this.status = BUNWASessionStatus.STOPPED;
      // Media storage is built per session; closing it releases the expiry
      // sweeper (BUNWEB already did this).
      this.mediaManager?.close();
      this.cleanupPresenceTimeout();
    }
  }

  async unpair(): Promise<void> {
    this.unpairing = true;
    if (this.client) {
      try {
        await this.client.logout();
      } catch {}
    }
    await this.stop();
  }

  private markReady(): void {
    this.clearReadyReconcile();
    this.populateMeInfo();
    this.status = BUNWASessionStatus.WORKING;
    this.maintainPresenceOnline();
  }

  private scheduleReadyReconcile(): void {
    this.clearReadyReconcile();
    if (this.status === BUNWASessionStatus.WORKING) return;
    this.readyReconcileStartedAt = Date.now();
    this.readyReconcileTimer = setTimeout(() => {
      if (this.status === BUNWASessionStatus.WORKING) return;
      if (!this.client) return;
      this.populateMeInfo();
      if (this.meInfo) {
        this.markReady();
      } else if (Date.now() - this.readyReconcileStartedAt < 120_000) {
        this.scheduleReadyReconcile();
      }
    }, 3_000);
  }

  private clearReadyReconcile(): void {
    if (this.readyReconcileTimer) {
      clearTimeout(this.readyReconcileTimer);
      this.readyReconcileTimer = null;
    }
  }

  private populateMeInfo(): void {
    if (!this.client?.info) return;
    const info = this.client.info;
    this.meInfo = {
      id: info?.wid?._serialized || '',
      pushName: info?.pushname || '',
    };
  }

  // ------------------------------------------------------------------
  // Auth / QR
  // ------------------------------------------------------------------

  getQR(): QR {
    return this.qr;
  }

  async requestCode(phoneNumber: string, method: string, params?: any): Promise<any> {
    if (!this.client) {
      throw new UnprocessableEntityException(
        'The WEBJS session is not started. Start the session and wait for the QR screen before requesting a code.',
      );
    }
    // Match the BUNWEB contract: a code is only meaningful while the session is
    // waiting for a link. Requesting one on a paired session used to reach
    // WhatsApp and fail with a minified error.
    if (this.status === BUNWASessionStatus.WORKING) {
      throw new UnprocessableEntityException(
        'The session is already paired. Unpair it before requesting a new pairing code.',
      );
    }
    if (this.status !== BUNWASessionStatus.SCAN_QR_CODE) {
      throw new UnprocessableEntityException(
        `Can request code only in SCAN_QR_CODE status. The current status is ${this.status}`,
      );
    }
    // Drive the alt-device-linking flow in the page instead of calling
    // client.requestPairingCode(): the library rethrows a serialized Error
    // whose message is minified ("t"), so the real reason (notably
    // IQErrorRateOverlimit / rate-overlimit) is lost by the time we see it.
    const page = this.webjsPage();
    if (!page) {
      throw new UnprocessableEntityException(
        'The WEBJS browser page is not available yet. Wait for the QR screen and retry.',
      );
    }
    const result = await page.evaluate(async (phone: string) => {
      try {
        const api = (globalThis as any).require('WAWebAltDeviceLinkingApi');
        api.setPairingType('ALT_DEVICE_LINKING');
        await api.initializeAltDeviceLinking();
        const code = await api.startAltLinkingFlow(phone, true);
        return { ok: true, code };
      } catch (e: any) {
        return {
          ok: false,
          name: e?.name ?? 'Error',
          type: e?.type?.name ?? null,
          code: e?.type?.value?.code ?? null,
          text: e?.type?.value?.text ?? null,
        };
      }
    }, phoneNumber);

    if (result?.ok && result.code) {
      // Same ABCD-ABCD presentation as the BUNWEB engine.
      const code = String(result.code);
      return { code: formatPairingCode(code), codeRaw: code, phoneNumber };
    }
    // 429 rate-overlimit is WhatsApp throttling this number/IP; retrying now
    // only extends the window, so surface it as a retryable 429.
    if (
      result?.code === 429 ||
      result?.text === 'rate-overlimit' ||
      result?.type === 'IQErrorRateOverlimit'
    ) {
      throw new PairingRateLimitedException(10 * 60_000);
    }
    throw new UnprocessableEntityException(
      `WhatsApp refused the pairing request (${result?.name ?? 'unknown error'}` +
        `${result?.type ? `: ${result.type}` : ''}). Check that the number is registered ` +
        'on WhatsApp, then request a new code.',
    );
  }

  async getEngineInfo(): Promise<any> {
    return {
      engine: BUNWAEngine.WEBJS,
      capabilities: {
        text: true,
        media: true,
        voiceNotes: true,
        buttons: false,
        lists: false,
        polls: false,
        pollVotes: false,
        groups: true,
        channels: false,
        labels: false,
        status: false,
        presence: true,
        lid: false,
        calls: true,
        mediaStorage: true,
      },
    };
  }

  getSessionMeInfo(): MeInfo | null {
    return this.meInfo;
  }

  // ------------------------------------------------------------------
  // Screenshot
  // ------------------------------------------------------------------

  async getScreenshot(): Promise<Buffer> {
    if (!this.client) {
      throw new Error('Session is not started');
    }
    // whatsapp-web.js >= 1.31 exposes the live page as `pupPage`; older builds
    // kept it under `client.puppeteer.page`. Support both so the screenshot
    // endpoint works across versions.
    const client = this.client as any;
    const page = client.pupPage ?? client.puppeteer?.page;
    if (!page) {
      throw new Error('Browser page not available');
    }
    return Buffer.from(await page.screenshot({ type: 'png' }));
  }

  // ------------------------------------------------------------------
  // Messaging
  // ------------------------------------------------------------------

  /**
   * Send a MessageMedia instance. whatsapp-web.js builds an internal WhatsApp
   * Web message model for media that the current web build refuses to key, so
   * every media send rejects with "Data passed to getter must include an id
   * property". The installed library version cannot send media against this
   * WhatsApp Web build; answer 422 with that reason instead of a generic 500.
   * Other errors keep their own handling.
   */
  private async sendMedia(
    chatId: string,
    media: MessageMedia,
    options: Record<string, any>,
  ): Promise<WAMessage> {
    try {
      const msg = await this.client!.sendMessage(chatId, media, options);
      return this.wrapMessage(msg);
    } catch (err: any) {
      const reason = err?.message || String(err);
      if (reason.includes('Data passed to getter must include an id property')) {
        this.notImplemented(
          'Sending media is not supported by the installed whatsapp-web.js version against the current WhatsApp Web build.',
        );
      }
      throw err;
    }
  }

  async sendText(request: MessageTextRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    return this.withSendingPolicy(chatId, async () => {
      const msg = await this.client!.sendMessage(chatId, request.text);
      return this.wrapMessage(msg);
    });
  }

  async sendImage(request: MessageImageRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const media = await this.toMessageMedia(request.file, 'image/png');
    return this.withSendingPolicy(chatId, () => this.sendMedia(chatId, media, { caption: request.caption }));
  }

  async sendFile(request: MessageFileRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const media = await this.toMessageMedia(request.file, 'application/octet-stream', 'file');
    return this.withSendingPolicy(chatId, () => this.sendMedia(chatId, media, { caption: request.caption }));
  }

  async sendVoice(request: MessageVoiceRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const media = await this.toMessageMedia(request.file, 'audio/ogg');
    return this.withSendingPolicy(chatId, () => this.sendMedia(chatId, media, {
      sendAudioAsVoice: request.convert !== false,
    }));
  }

  async sendVideo(request: MessageVideoRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const media = await this.toMessageMedia(request.file, 'video/mp4', 'video');
    return this.withSendingPolicy(chatId, () => this.sendMedia(chatId, media, { caption: request.caption }));
  }

  async sendLocation(request: MessageLocationRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const { Location } = await import('whatsapp-web.js');
    const loc = new Location(request.latitude, request.longitude, {
      name: request.title || '',
    });
    return this.withSendingPolicy(chatId, async () => {
      const msg = await this.client!.sendMessage(chatId, loc);
      return this.wrapMessage(msg);
    });
  }

  async forwardMessage(request: MessageForwardRequest): Promise<WAMessage> {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);

    const forward = async (found: any): Promise<WAMessage> => {
      try {
        await found.forward(chatId);
      } catch (err: any) {
        // whatsapp-web.js forwards through WAWebChatForwardMessage, a module
        // the current WhatsApp Web build no longer exposes, so the library's
        // forward path cannot work here. Report that instead of a 500.
        const reason = err?.message || String(err);
        if (reason.includes('forwardMessages')) {
          this.notImplemented(
            'Forwarding is not supported by the installed whatsapp-web.js version against the current WhatsApp Web build.',
          );
        }
        throw err;
      }

      const destChat = await this.getChatOrFail(chatId);
      const sent = await destChat.fetchMessages({ limit: 5, fromMe: true });
      if (sent.length > 0) {
        return this.wrapMessage(sent[sent.length - 1]);
      }
      return { id: '', timestamp: Date.now(), from: '', fromMe: true, source: 'api', to: '' };
    };

    // Prefer the library's direct lookup; the chat scan below is a fallback for
    // builds where getMessageById cannot answer.
    const direct = await this.findMessageById(request.messageId);
    if (direct) return forward(direct);

    const chats = await this.client!.getChats();
    for (const chat of chats.slice(0, 10)) {
      let msgs: any[];
      try {
        msgs = await chat.fetchMessages({ limit: 100 });
      } catch {
        continue;
      }
      const found = msgs.find((m: any) => this.matchesMessageId(m, request.messageId));
      if (!found) continue;
      return forward(found);
    }
    throw new NotFoundException(`Message ${request.messageId} not found for forwarding`);
  }

  /**
   * Resolve a message by id.
   *
   * whatsapp-web.js can answer directly through `getMessageById`; the previous
   * implementation only scanned the last 100 messages of one chat (or the
   * first 10 chats), so replying to, reacting to or deleting an older message
   * failed with "not found" even though the message existed.
   */
  private async findMessageById(messageId: string, chatId?: string): Promise<any | null> {
    try {
      const direct = await (this.client as any)?.getMessageById?.(messageId);
      if (direct) return direct;
    } catch {
      // Fall through to the per-chat scan below.
    }
    if (!chatId) return null;
    try {
      const chat = await this.getChatOrFail(chatId);
      const msgs = await chat.fetchMessages({ limit: 100 });
      return msgs.find((m: any) => this.matchesMessageId(m, messageId)) ?? null;
    } catch {
      return null;
    }
  }

  async reply(request: MessageReplyRequest) {
    this.ensureClientReady();
    if (!request.reply_to) {
      throw new BadRequestException('reply_to is required: send the message id to quote.');
    }
    const target = await this.findMessageById(request.reply_to, request.chatId);
    if (!target) {
      throw new NotFoundException(`Message ${request.reply_to} not found for reply`);
    }
    return this.withSendingPolicy(request.chatId, async () => {
      const msg = await target.reply(request.text);
      return this.wrapMessage(msg);
    });
  }

  async sendSeen(request: SendSeenRequest) {
    this.ensureClientReady();
    const chat = await this.getChatOrFail(request.chatId);
    await chat.sendSeen();
  }

  async startTyping(request: ChatRequest): Promise<void> {
    this.ensureClientReady();
    const chat = await this.getChatOrFail(request.chatId);
    try {
      await chat.sendStateTyping();
    } catch {}
  }

  async stopTyping(request: ChatRequest) {
    this.ensureClientReady();
    const chat = await this.getChatOrFail(request.chatId);
    try {
      await chat.clearState();
    } catch {}
  }

  async setReaction(request: MessageReactionRequest) {
    this.ensureClientReady();
    const target = await this.findMessageById(request.messageId, request.chatId);
    if (!target) {
      throw new NotFoundException(`Message ${request.messageId} not found for reaction`);
    }
    await (target as any).react(request.reaction);
  }

  async checkNumberStatus(request: CheckNumberStatusQuery): Promise<WANumberExistResult> {
    this.ensureClientReady();
    if (isUsernameAddress(request.phone)) {
      throw new UnprocessableEntityException(
        `The WEBJS engine cannot look up a WhatsApp username. Check a numeric number instead.`,
      );
    }
    const phone = request.phone;
    let numberId: any = null;
    try {
      numberId = await this.client!.getNumberId(phone);
    } catch (err: any) {
      // whatsapp-web.js throws "wid error: invalid wid" for a value that is
      // not a plausible number instead of answering null. That is the
      // protocol's negative answer, not a server fault.
      return {
        exists: false,
        isBusiness: false,
        canReceiveMessage: false,
        number: phone,
        status: 'not_resolvable',
        reason: `WhatsApp rejected this number as invalid: ${err?.message || err}`,
      };
    }
    const exists = numberId !== null && numberId !== undefined;
    return {
      exists,
      isBusiness: false,
      canReceiveMessage: exists,
      number: phone,
      status: exists ? 'resolved' : 'not_resolvable',
      ...(exists ? {} : { reason: 'WhatsApp answered that this number is not registered.' }),
    };
  }

  // ------------------------------------------------------------------
  // Chats
  // ------------------------------------------------------------------

  async getChats(pagination?: PaginationParams) {
    this.ensureClientReady();
    const chats = await this.client!.getChats();
    const rows = chats
      .filter((c) => c.id?._serialized)
      .map((c) => ({
        id: c.id._serialized,
        name: c.name || c.id._serialized,
        isGroup: Boolean(c.isGroup),
        unreadCount: c.unreadCount || 0,
        lastMessage: c.lastMessage
          ? {
              id: this.messageIdSerialized(c.lastMessage.id),
              from: c.lastMessage.from || '',
              to: c.lastMessage.to || '',
              body: c.lastMessage.body || '',
              type: mapWwebjsMessageType(c.lastMessage.type || 'text'),
              timestamp: c.lastMessage.timestamp || 0,
              fromMe: Boolean(c.lastMessage.fromMe),
            }
          : undefined,
      }));
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;
    return rows.slice(offset, offset + limit);
  }

  /**
   * Chat list shape used by the dashboard. WEBJS has no message store, so the
   * overview is projected from the live chat list; filtering and paging happen
   * here rather than in a database.
   */
  async getChatsOverview(
    pagination?: PaginationParams & { merge?: boolean },
    filter?: { ids?: string[] },
  ): Promise<any[]> {
    this.ensureClientReady();
    // The overview pages itself below; read the full live list first so
    // offsets beyond the first page still resolve.
    const chats = await this.getChats({ limit: Number.MAX_SAFE_INTEGER, offset: 0 });
    const wanted = filter?.ids?.length
      ? new Set(filter.ids.map((id) => String(id).split('@')[0]))
      : null;
    const rows = chats
      .filter((chat: any) => !wanted || wanted.has(String(chat.id).split('@')[0]))
      .map((chat: any) => ({
        id: chat.id,
        name: chat.name,
        picture: undefined,
        unreadCount: chat.unreadCount,
        lastMessage: chat.lastMessage,
      }));
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;
    return rows.slice(offset, offset + limit);
  }

  async getChatMessages(
    chatId: string,
    query: GetChatMessagesQuery,
    filter: GetChatMessagesFilter,
  ): Promise<WAMessage[]> {
    this.ensureClientReady();
    const chat = await this.getChatOrFail(chatId);
    const limit = query?.limit || 50;
    const msgs = await chat.fetchMessages({ limit });
    let messages: WAMessage[] = [];
    for (const m of msgs) {
      const mapped = this.mapMessageToWAMessage(m);
      if (query?.downloadMedia && mapped.hasMedia) {
        await this.attachMedia(m, mapped);
      }
      messages.push(mapped);
    }
    // BUNWEB applies this filter in the store; WEBJS has no store, so apply the
    // same contract client-side instead of ignoring the caller's query.
    const timestampFilter = filter?.timestamp ?? {
      gte: filter?.['filter.timestamp.gte'],
      lte: filter?.['filter.timestamp.lte'],
    };
    const fromMeFilter = filter?.fromMe ?? filter?.['filter.fromMe'];
    const ackFilter = filter?.ack?.length
      ? filter.ack
      : filter?.['filter.ack'] !== undefined
        ? [filter['filter.ack'] as number]
        : undefined;
    messages = messages.filter((m: any) => {
      if (timestampFilter?.gte != null && m.timestamp < timestampFilter.gte) return false;
      if (timestampFilter?.lte != null && m.timestamp > timestampFilter.lte) return false;
      if (fromMeFilter !== undefined && Boolean(m.fromMe) !== Boolean(fromMeFilter)) return false;
      if (ackFilter && !ackFilter.includes(Number(m.ack))) return false;
      return true;
    });
    // BUNWEB sorts by messageTimestamp DESC by default; webjs returns the chat's
    // own order, which made the same endpoint answer differently per engine.
    const ascending = String(query?.sortOrder || 'desc').toLowerCase() === 'asc';
    messages.sort((a: any, b: any) =>
      ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp,
    );
    return messages;
  }

  async chatsArchiveChat(chatId: string): Promise<any> {
    this.ensureClientReady();
    return this.client!.archiveChat(this.ensureSuffix(chatId));
  }

  async chatsUnarchiveChat(chatId: string): Promise<any> {
    this.ensureClientReady();
    return this.client!.unarchiveChat(this.ensureSuffix(chatId));
  }

  async chatsUnreadChat(chatId: string): Promise<any> {
    this.ensureClientReady();
    return this.client!.markChatUnread(this.ensureSuffix(chatId));
  }

  async muteChat(chatId: string, durationSeconds?: number): Promise<any> {
    this.ensureClientReady();
    // whatsapp-web.js mutes until a Date, or for always when none is given.
    const until = durationSeconds && durationSeconds > 0 ? new Date(Date.now() + durationSeconds * 1000) : undefined;
    return this.client!.muteChat(this.ensureSuffix(chatId), until);
  }

  async unmuteChat(chatId: string): Promise<any> {
    this.ensureClientReady();
    return this.client!.unmuteChat(this.ensureSuffix(chatId));
  }

  async readChatMessages(
    chatId: string,
    request: ReadChatMessagesQuery,
  ): Promise<ReadChatMessagesResponse> {
    return this.readChatMessagesWSImpl(chatId, request);
  }

  async getChatMessage(
    chatId: string,
    messageId: string,
    query: GetChatMessageQuery,
  ): Promise<WAMessage | null> {
    this.ensureClientReady();
    const found = await this.findMessageById(messageId, chatId);
    if (!found) return null;
    const message = this.mapMessageToWAMessage(found);
    if (query?.downloadMedia && message.hasMedia) {
      await this.attachMedia(found, message);
    }
    return message;
  }

  async deleteMessage(chatId: string, messageId: string) {
    this.ensureClientReady();
    const target = await this.findMessageById(messageId, chatId);
    if (!target) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }
    await target.delete(true);
  }

  // ------------------------------------------------------------------
  // Contacts
  // ------------------------------------------------------------------

  async getContact(query: ContactQuery) {
    this.ensureClientReady();
    const id = query.contactId;
    try {
      const c = await this.client!.getContactById(this.ensureSuffix(id));
      return {
        id: c.id._serialized,
        name: c.name || c.pushname || '',
        phone: c.number,
        pushName: c.pushname || undefined,
        isBusiness: (c as any).isBusiness || false,
        isMyContact: c.isMyContact || false,
      };
    } catch {
      return null;
    }
  }

  async getContacts(pagination?: PaginationParams) {
    this.ensureClientReady();
    const contacts = await this.client!.getContacts();
    return contacts.map((c) => ({
      id: c.id._serialized,
      name: c.name || c.pushname || '',
      phone: c.number,
      pushName: c.pushname || undefined,
      isBusiness: (c as any).isBusiness || false,
      isMyContact: c.isMyContact || false,
    }));
  }

  async fetchContactProfilePicture(id: string): Promise<string | null> {
    this.ensureClientReady();
    try {
      const url = await this.client!.getProfilePicUrl(id);
      return url || null;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Groups
  // ------------------------------------------------------------------

  async getGroup(id: string): Promise<GroupInfo> {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    return {
      id: chat.id._serialized,
      subject: chat.name || undefined,
      description: (chat as any).description || undefined,
      participants: ((chat as any).participants || []).map((p: any) =>
        toGroupParticipant(p),
      ),
    };
  }

  async getGroupParticipants(id: string): Promise<GroupParticipant[]> {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    return ((chat as any).participants || []).map((p: any) =>
      toGroupParticipant(p),
    );
  }

  async getGroups(pagination?: PaginationParams) {
    this.ensureClientReady();
    const chats = await this.client!.getChats();
    const groups = chats.filter((c) => c.isGroup);
    return groups.map((g) => ({
      id: g.id._serialized,
      name: g.name || g.id._serialized,
      participants: ((g as any).participants || []).map((p: any) => p.id._serialized),
    }));
  }

  async createGroup(request: CreateGroupRequest) {
    this.ensureClientReady();
    const participants = (request.participants || []).map(toWebjsParticipantId);
    const result = await this.client!.createGroup(request.name, participants) as any;
    return {
      id: result.gid._serialized,
      name: request.name,
      participants,
    };
  }

  async addParticipants(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    const ids = (request.participants || []).map(toWebjsParticipantId);
    await (chat as any).addParticipants(ids);
  }

  async removeParticipants(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    const ids = (request.participants || []).map(toWebjsParticipantId);
    await (chat as any).removeParticipants(ids);
  }

  async leaveGroup(id: string) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    await (chat as any).leave();
  }

  async setDescription(id: string, description: string) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    await (chat as any).setDescription(description);
  }

  async setSubject(id: string, subject: string) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    await (chat as any).setSubject(subject);
  }

  async getInviteCode(id: string): Promise<string> {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    try {
      return await (chat as any).getInviteCode();
    } catch (err: any) {
      // whatsapp-web.js calls WAWebMexFetchGroupInviteCodeJob, a module the
      // current WhatsApp Web build no longer exposes.
      const reason = err?.message || String(err);
      if (reason.includes('fetchMexGroupInviteCode')) {
        this.notImplemented(
          'Group invite codes are not supported by the installed whatsapp-web.js version against the current WhatsApp Web build.',
        );
      }
      throw err;
    }
  }

  async revokeInviteCode(id: string): Promise<string> {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    try {
      return await (chat as any).revokeInvite();
    } catch (err: any) {
      // Same removed module family as getInviteCode; resetGroupInviteCode is
      // no longer exported by WAWebGroupQueryJob either.
      const reason = err?.message || String(err);
      if (reason.includes('resetGroupInviteCode') || reason.includes('fetchMexGroupInviteCode')) {
        this.notImplemented(
          'Revoking group invite codes is not supported by the installed whatsapp-web.js version against the current WhatsApp Web build.',
        );
      }
      throw err;
    }
  }

  async promoteParticipantsToAdmin(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    const ids = (request.participants || []).map(toWebjsParticipantId);
    await (chat as any).promoteParticipants(ids);
  }

  async demoteParticipantsToUser(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.getGroupChatOrFail(id);
    const ids = (request.participants || []).map(toWebjsParticipantId);
    await (chat as any).demoteParticipants(ids);
  }

  // ------------------------------------------------------------------
  // Presence
  // ------------------------------------------------------------------

  async setPresence(presence: BUNWAPresenceStatus, chatId?: string): Promise<void> {
    if (!this.client) return;
    try {
      if (chatId) {
        const chat = await this.client!.getChatById(this.ensureSuffix(chatId));
        if (presence === BUNWAPresenceStatus.TYPING) {
          await chat.sendStateTyping();
        } else if (presence === BUNWAPresenceStatus.RECORDING) {
          await chat.sendStateRecording();
        } else {
          await chat.clearState();
        }
      }
    } catch {
      // Presence is best-effort
    }
  }

  /**
   * WEBJS only receives presence events, it does not keep a presence store.
   * Return the last state observed for each chat so the dashboard can seed
   * its online/typing dots.
   */
  async getPresences(): Promise<any[]> {
    return [...this.presences.entries()].map(([id, state]) => ({
      id,
      presences: [{ participant: id, lastKnownPresence: state, lastSeen: null }],
    }));
  }

  async getPresence(chatId: string): Promise<any> {
    const id = this.ensureSuffix(chatId);
    const state = this.presences.get(id);
    return {
      id,
      presences: state
        ? [{ participant: id, lastKnownPresence: state, lastSeen: null }]
        : [],
    };
  }

  async subscribePresence(_chatId: string): Promise<void> {
    // whatsapp-web.js has no presence-subscribe API; events arrive globally.
  }

  // ------------------------------------------------------------------
  // Calls (WEBJS only)
  // ------------------------------------------------------------------

  private webjsPage(): any {
    return (this.client as any)?.pupPage ?? (this.client as any)?.puppeteer?.page ?? null;
  }

  private async installCalls(): Promise<void> {
    const page = this.webjsPage();
    if (!page) return;
    try {
      if (this.calls) {
        await this.calls.reinstall();
      } else {
        this.calls = new WebJSCallController(() => this.webjsPage(), this.logger);
        await this.calls.install();
      }
    } catch (err) {
      // Calls are experimental and depend on private WhatsApp Web modules.
      // A session without them must still work for messaging.
      this.logger.warn({ err }, 'WhatsApp Web call controls are unavailable');
    }
  }

  async startCall(chatId: string, options: StartCallOptions = {}): Promise<CallInfo | null> {
    if (!this.calls) throw new Error('WhatsApp Web calls are not available for this session');
    return this.calls.start(chatId, options);
  }

  async endCall(callId?: string): Promise<boolean> {
    if (!this.calls) throw new Error('WhatsApp Web calls are not available for this session');
    return this.calls.end(callId);
  }

  async getActiveCall(): Promise<CallInfo | null> {
    if (!this.calls) return null;
    return this.calls.active();
  }

  async callDiagnostics(): Promise<Record<string, any>> {
    if (!this.calls) throw new Error('WhatsApp Web calls are not available for this session');
    return this.calls.diagnostics();
  }

  async acceptCall(callId: string, video = false, injectAudio = true): Promise<boolean> {
    if (!this.calls) throw new Error('WhatsApp Web calls are not available for this session');
    return this.calls.accept(callId, video, injectAudio);
  }

  async playCallAudio(base64: string): Promise<number> {
    if (!this.calls) throw new Error('WhatsApp Web calls are not available for this session');
    return this.calls.speak(base64);
  }

  onCallAudio(listener: (chunk: CallAudioChunk) => void): () => void {
    if (!this.calls) return () => undefined;
    return this.calls.onAudio(listener);
  }

  async rejectCall(_from: string, id: string): Promise<void> {
    if (!this.calls) throw new Error('WhatsApp Web calls are not available for this session');
    await this.calls.reject();
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * Two whatsapp-web.js internals are incompatible with the current WhatsApp
   * Web build:
   *
   * 1. getChatModel resolves a chat's last message through
   *    Msg.getMessagesById, which throws an IndexedDB DataError when the last
   *    received message is not in the in-memory store. That makes getChats()
   *    and getChatById() reject for every real chat, so the API answered 500
   *    for the chats list, message history and groups.
   * 2. sendMessage looks the just-sent message up with
   *    Msg.get(key._serialized), but the message key of this build exposes the
   *    serialized form as `$1` and not `_serialized`, so the lookup misses and
   *    sendMessage resolves undefined even though the message was sent.
   *
   * Patch both: take the last message from the loaded collection when the
   * lookup misses, and return the newly added collection entry when a send
   * reports no message. The rest of the library implementation still runs.
   */
  private async installChatModelShim(): Promise<void> {
    const client = this.client as any;
    const page = client?.pupPage ?? client?.puppeteer?.page;
    if (!page) return;
    try {
      await page.evaluate(() => {
        const wwebjs = (globalThis as any).WWebJS;
        if (!wwebjs) return;

        if (!wwebjs.__bunwaChatModelShim) {
          const original = wwebjs.getChatModel;
          wwebjs.getChatModel = async (chat: any, options: any = {}) => {
            const lastReceivedKey = chat.lastReceivedKey;
            let model: any;
            try {
              chat.lastReceivedKey = null;
              model = await original.call(wwebjs, chat, options);
            } finally {
              chat.lastReceivedKey = lastReceivedKey;
            }
            if (!model.lastMessage && chat.msgs?.getModelsArray) {
              try {
                const messages = chat.msgs.getModelsArray();
                const last = messages[messages.length - 1];
                if (last) model.lastMessage = wwebjs.getMessageModel(last);
              } catch {
                // Keep lastMessage null when the collection is not readable.
              }
            }
            return model;
          };
          wwebjs.__bunwaChatModelShim = true;
        }

        if (!wwebjs.__bunwaSendMessageShim) {
          const originalSend = wwebjs.sendMessage;
          wwebjs.sendMessage = async (chat: any, content: any, options: any = {}) => {
            const countBefore = chat?.msgs?.getModelsArray?.().length ?? 0;
            const message = await originalSend.call(wwebjs, chat, content, options);
            if (message) return message;
            const messages = chat?.msgs?.getModelsArray?.() ?? [];
            return messages.length > countBefore ? messages[messages.length - 1] : undefined;
          };
          wwebjs.__bunwaSendMessageShim = true;
        }
      });
      this.logger.debug('Installed the WhatsApp Web compatibility shims');
    } catch (err) {
      this.logger.warn({ err }, 'Could not install the WhatsApp Web compatibility shims');
    }
  }

  /**
   * Serialize a message id the way the WAHA API addresses messages:
   * `{fromMe}_{remote}_{id}`. The current WhatsApp Web build exposes the
   * serialized key as `$1` instead of `_serialized`, and whatsapp-web.js
   * passes the raw model id through untouched, so both spellings and the
   * component form are accepted.
   */
  /**
   * A message matches by its serialized ID or by the bare WhatsApp ID that
   * sends return (key.id) — callers hold whichever they were given.
   */
  private matchesMessageId(message: any, messageId: string | undefined): boolean {
    if (!messageId) return false;
    return this.messageIdSerialized(message?.id) === messageId || message?.id?.id === messageId;
  }

  private messageIdSerialized(id: any): string {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (id._serialized) return id._serialized;
    if (id.$1) return id.$1;
    if (id.id) return `${id.fromMe}_${id.remote}_${id.id}`;
    return '';
  }

  /**
   * Resolve a chat the way every chat-scoped method needs it: a well-formed
   * address, a chat the engine knows, or a 404 naming the address. A missing
   * chat throws from whatsapp-web.js with a transport-shaped error
   * ("No LID for user"), which used to reach the caller as a generic 500.
   */
  private async getChatOrFail(chatId: string): Promise<any> {
    const jid = this.ensureSuffix(chatId);
    let chat: any;
    try {
      chat = await this.client!.getChatById(jid);
    } catch (err: any) {
      // whatsapp-web.js rejects an unknown chat with a transport-shaped error
      // (its message can arrive minified from the page realm), which used to
      // reach the caller as a generic 500. Log it and answer 404.
      this.logger.debug({ err }, `Chat ${jid} could not be resolved`);
      throw new NotFoundException(`Chat ${jid} not found`);
    }
    if (!chat) {
      throw new NotFoundException(`Chat ${jid} not found`);
    }
    return chat;
  }

  private async getGroupChatOrFail(id: string): Promise<any> {
    const chat = await this.getChatOrFail(id);
    if (!chat.isGroup) {
      throw new NotFoundException(`Group ${this.ensureSuffix(id)} not found`);
    }
    return chat;
  }

  private ensureClientReady(): void {
    if (!this.client) {
      throw new UnprocessableEntityException(
        'The WEBJS session is not started. Start the session first.',
      );
    }
    if (this.status !== BUNWASessionStatus.WORKING) {
      // A plain Error became a 500 here; the rest of the API answers 422 with
      // the reason when a session exists but is not usable.
      throw new UnprocessableEntityException(
        `The WEBJS session is not ready yet (status ${this.status}). Wait for WORKING.`,
      );
    }
  }

  /**
   * Materialize any accepted media input into a MessageMedia for webjs.
   *
   * The old path forwarded every string to `Buffer.from(str, 'base64')`, so a
   * local path or a `{ url }` object became garbage bytes. The shared resolver
   * distinguishes buffer / base64 / data URL / http(s) URL / local path, and
   * this method does the one bit of I/O MessageMedia requires.
   */
  private async toMessageMedia(
    file: unknown,
    fallbackMimetype: string,
    fallbackFilename?: string,
  ): Promise<MessageMedia> {
    const resolved = resolveMediaInput(file);
    let buffer: Buffer;
    if (resolved.buffer) {
      buffer = resolved.buffer;
    } else if (resolved.url) {
      buffer = await fetchBuffer(resolved.url);
    } else if (resolved.path) {
      buffer = await readMediaFile(resolved.path);
    } else {
      throw new UnprocessableEntityException(UNSUPPORTED_FILE_INPUT);
    }
    return new MessageMedia(
      resolved.mimetype || fallbackMimetype,
      buffer.toString('base64'),
      resolved.filename || fallbackFilename,
    );
  }

  protected ensureSuffix(phone: string): string {
    // whatsapp-web.js has no username lookup; build the address only for a
    // numeric id, and refuse a handle with a clear reason instead of turning
    // it into a broken JID like `alice@c.us`.
    if (isUsernameAddress(phone)) {
      throw new UnprocessableEntityException(
        `The WEBJS engine cannot address a WhatsApp username. Send to a numeric JID instead, for example 15551234567@c.us.`,
      );
    }
    if (phone.includes('@')) return phone;
    return `${phone}@c.us`;
  }

  private mapIncomingMessage(msg: any): any {
    const ack = Number.isFinite(msg.ack) ? Number(msg.ack) : WAMessageAck.PENDING;
    const contextInfo = msg._data?.contextInfo;
    return {
      id: this.messageIdSerialized(msg.id),
      from: msg.from || '',
      to: msg.to || '',
      // The sender inside a group chat (unset in a 1:1 chat).
      author: msg.author || undefined,
      body: msg.body || '',
      type: mapWwebjsMessageType(msg.type || 'text'),
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      isForwarded: Boolean(msg.isForwarded),
      // `fromMe`, the field BUNWEB and every consumer (dashboard, Chatwoot,
      // webhooks) read; this used to be `isFromMe`.
      fromMe: Boolean(msg.fromMe),
      // BUNWEB marks every engine-originated message `api` and inbound `app`.
      source: msg.fromMe ? 'api' : 'app',
      hasMedia: Boolean(msg.hasMedia),
      mediaMimeType: msg._data?.mimetype || undefined,
      ack,
      ackName: WAMessageAck[ack] || 'UNKNOWN',
      replyTo: contextInfo?.quotedMessage
        ? {
            id: contextInfo.stanzaId,
            participant: contextInfo.participant || undefined,
            body: msg._data?.quotedMsg?.body || '',
            hasMedia: Boolean(contextInfo.quotedMessage?.imageMessage || contextInfo.quotedMessage?.videoMessage || contextInfo.quotedMessage?.documentMessage),
            media: null,
            _data: contextInfo.quotedMessage,
          }
        : null,
      _data: msg._data,
    };
  }

  private mapMessageToWAMessage(msg: any): WAMessage {
    const ack = Number.isFinite(msg.ack) ? Number(msg.ack) : WAMessageAck.PENDING;
    return {
      id: this.messageIdSerialized(msg.id),
      from: msg.from || '',
      to: msg.to || '',
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      fromMe: Boolean(msg.fromMe),
      source: msg.fromMe ? 'api' : 'app',
      body: msg.body || '',
      type: mapWwebjsMessageType(msg.type || 'text'),
      author: msg.author || undefined,
      participant: msg.author || undefined,
      hasMedia: Boolean(msg.hasMedia),
      ack,
      ackName: WAMessageAck[ack] || 'UNKNOWN',
      _data: msg._data,
    };
  }

  private wrapMessage(msg: any): WAMessage {
    if (!msg) {
      throw new UnprocessableEntityException(
        'The WEBJS engine sent the message but could not read it back from WhatsApp Web.',
      );
    }
    // Return what was actually sent, not an empty shell: callers use the body
    // and type to update their own view of the chat (BUNWEB returns the full
    // WAMessage from the protocol).
    const ack = Number.isFinite(msg.ack) ? Number(msg.ack) : WAMessageAck.PENDING;
    return {
      id: this.messageIdSerialized(msg.id),
      from: msg.from || '',
      to: msg.to || '',
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      fromMe: true,
      source: 'api',
      body: msg.body || '',
      type: mapWwebjsMessageType(msg.type || 'text'),
      hasMedia: Boolean(msg.hasMedia),
      ack,
      ackName: WAMessageAck[ack] || 'UNKNOWN',
      _data: msg._data,
    };
  }
}

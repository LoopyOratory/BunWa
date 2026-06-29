/**
 * whatsapp-web.js Session for WAHA-Bun
 *
 * Extends WhatsappSession (the same base class used by NOWEB/Baileys) and
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
import NodeCache from 'node-cache';
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
  WAHAEngine,
  WAHAEvents,
  WAHAPresenceStatus,
  WAHASessionStatus,
} from '../../../structures/enums.dto';
import { BinaryFile, RemoteFile } from '../../../structures/files.dto';
import {
  CreateGroupRequest,
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
import { WhatsappSession } from '../../abc/session.abc';
import {
  NotImplementedByEngineError,
} from '../../exceptions';
import { fetchBuffer } from '../../../utils/fetch';

// ---------------------------------------------------------------------------
// Chrome path — prefer env var, fall back to auto-detect
// ---------------------------------------------------------------------------
const CHROME_PATH =
  process.env.CHROME_PATH ||
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  '/usr/bin/google-chrome';

const WEBJS_SESSIONS_DIR = path.join(process.cwd(), '.sessions', 'webjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mapWwebjsMessageType(wwebjsType: string): string {
  const map: Record<string, string> = {
    chat: 'text',
    text: 'text',
    image: 'image',
    video: 'video',
    audio: 'audio',
    ptt: 'audio',
    document: 'document',
    sticker: 'sticker',
    location: 'location',
    contact_card: 'contact',
    contacts_vcard: 'contact',
    reaction: 'reaction',
  };
  return map[wwebjsType] || 'unknown';
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// ---------------------------------------------------------------------------
// Session class
// ---------------------------------------------------------------------------
export class WhatsappSessionWebJs extends WhatsappSession {
  engine = WAHAEngine.WEBJS;

  private client: Client | null = null;
  private qr: QR = new QR();
  private meInfo: MeInfo | null = null;
  private profilePicture: NodeCache = new NodeCache({ stdTTL: 24 * 60 * 60 });
  private readyReconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private readyReconcileStartedAt = 0;
  private authTimeout?: number;

  // RxJS Subjects for bridging whatsapp-web.js events → WAHA event observables
  private eventSubjects: Map<WAHAEvents, Subject<any>> = new Map();

  public constructor(config: any) {
    super(config);
    this.logger = this.loggerBuilder.child({ name: 'WebJsSession' });
  }

  private getEventSubject(event: WAHAEvents): Subject<any> {
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
    this.status = WAHASessionStatus.STARTING;
    this.logger.info('Starting whatsapp-web.js session...');

    // Ensure sessions directory exists
    if (!fs.existsSync(WEBJS_SESSIONS_DIR)) {
      fs.mkdirSync(WEBJS_SESSIONS_DIR, { recursive: true });
    }

    try {
      await this.buildClient();
    } catch (err: any) {
      this.logger.error({ err }, 'Failed to start whatsapp-web.js client');
      this.status = WAHASessionStatus.FAILED;
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
      '--disable-gpu',
      '--disable-extensions',
      '--disable-sync',
      '--mute-audio',
      '--window-size=1280,720',
    ];

    // Add proxy if configured
    if (this.proxyConfig?.server) {
      puppeteerArgs.push(`--proxy-server=${this.proxyConfig.server}`);
      this.logger.info(`Using proxy: ${this.proxyConfig.server}`);
    }

    if (this.sessionConfig?.webjs?.authTimeout) {
      this.authTimeout = this.sessionConfig.webjs.authTimeout;
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.name,
        dataPath: path.resolve(WEBJS_SESSIONS_DIR),
      }),
      puppeteer: {
        headless: true,
        args: puppeteerArgs,
        executablePath: CHROME_PATH,
      },
      ...(this.authTimeout ? { authTimeoutMs: this.authTimeout } : {}),
    });

    this.setupEventHandlers();
    await this.client.initialize();
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    const status$ = this.getEventSubject(WAHAEvents.SESSION_STATUS);
    const msg$ = this.getEventSubject(WAHAEvents.MESSAGE);
    const msgAny$ = this.getEventSubject(WAHAEvents.MESSAGE_ANY);
    const msgAck$ = this.getEventSubject(WAHAEvents.MESSAGE_ACK);
    const groupJoin$ = this.getEventSubject(WAHAEvents.GROUP_JOIN);
    const groupLeave$ = this.getEventSubject(WAHAEvents.GROUP_LEAVE);
    const presence$ = this.getEventSubject(WAHAEvents.PRESENCE_UPDATE);

    this.client.on('qr', async (qrRaw: string) => {
      try {
        this.qr.save(qrRaw);
        this.status = WAHASessionStatus.SCAN_QR_CODE;
        this.printQR(this.qr);
        this.logger.info('QR code received — scan with WhatsApp');
        status$.next({
          status: WAHASessionStatus.SCAN_QR_CODE,
          qr: await this.qr.get(),
        });
      } catch (err) {
        this.logger.error({ err }, 'Error handling QR');
      }
    });

    this.client.on('authenticated', () => {
      this.logger.info('Authenticated successfully');
      if (this.status !== WAHASessionStatus.WORKING &&
          this.status !== WAHASessionStatus.FAILED) {
        this.status = WAHASessionStatus.STARTING;
      }
    });

    this.client.on('auth_failure', (msg: string) => {
      this.logger.error({ msg }, 'Auth failure');
      this.status = WAHASessionStatus.FAILED;
    });

    this.client.on('ready', () => {
      this.logger.info('Client ready — session is WORKING');
      this.markReady();
    });

    this.client.on('disconnected', (reason: WAState) => {
      this.logger.warn(`Disconnected: ${reason}`);
      if (this.status === WAHASessionStatus.WORKING) {
        this.status = WAHASessionStatus.FAILED;
      }
    });

    // Incoming messages
    this.client.on('message', async (msg: any) => {
      try {
        const waMsg = this.mapIncomingMessage(msg);

        // Attach sender contact info
        try {
          const contact = await msg.getContact();
          if (contact) waMsg.from = contact.id?._serialized || waMsg.from;
        } catch {}

        msg$.next(waMsg);
        this.maintainPresenceOnline();
      } catch (err) {
        this.logger.error({ err }, 'Error processing incoming message');
      }
    });

    // Outgoing messages (from me)
    this.client.on('message_create', (msg: any) => {
      if (!msg.fromMe) return;
      const waMsg = this.mapIncomingMessage(msg);
      msgAny$.next(waMsg);
    });

    // Message acknowledgements
    this.client.on('message_ack', (msg: any, ack: number) => {
      msgAck$.next({
        id: msg.id._serialized,
        from: msg.from,
        to: msg.to,
        ack,
        status: ack >= 3 ? 'read' : ack === 2 ? 'delivered' : ack === 1 ? 'sent' : 'pending',
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
      presence$.next({
        id: presence.id?._serialized || presence.id || '',
        presence: presence.state || 'unavailable',
        timestamp: Date.now(),
      });
    });
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping whatsapp-web.js session...');
    if (!this.client) {
      this.status = WAHASessionStatus.STOPPED;
      return;
    }
    try {
      await this.client.destroy();
    } catch (err) {
      this.logger.warn({ err }, 'Error destroying client');
    } finally {
      this.client = null;
      this.qr = new QR();
      this.status = WAHASessionStatus.STOPPED;
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
    this.status = WAHASessionStatus.WORKING;
    this.maintainPresenceOnline();
  }

  private scheduleReadyReconcile(): void {
    this.clearReadyReconcile();
    if (this.status === WAHASessionStatus.WORKING) return;
    this.readyReconcileStartedAt = Date.now();
    this.readyReconcileTimer = setTimeout(() => {
      if (this.status === WAHASessionStatus.WORKING) return;
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
      throw new Error('Session is not initialized');
    }
    const code = await this.client.requestPairingCode(phoneNumber);
    return { code, phoneNumber };
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
    const puppeteer = (this.client as any).puppeteer;
    if (!puppeteer?.page) {
      throw new Error('Browser page not available');
    }
    const page = puppeteer.page;
    return Buffer.from(await page.screenshot({ type: 'png' }));
  }

  // ------------------------------------------------------------------
  // Messaging
  // ------------------------------------------------------------------

  async sendText(request: MessageTextRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const msg = await this.client!.sendMessage(chatId, request.text);
    return this.wrapMessage(msg);
  }

  async sendImage(request: MessageImageRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const fileData = this.fileToBuffer(request.file);
    const buf = typeof fileData === 'string' && isHttpUrl(fileData)
      ? await fetchBuffer(fileData)
      : typeof fileData === 'string'
        ? Buffer.from(fileData, 'base64')
        : fileData;
    const media = new MessageMedia(
      request.file?.mimetype || 'image/png',
      buf.toString('base64'),
    );
    const msg = await this.client!.sendMessage(chatId, media, {
      caption: request.caption,
    });
    return this.wrapMessage(msg);
  }

  async sendFile(request: MessageFileRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const fileData = this.fileToBuffer(request.file);
    const buf = typeof fileData === 'string' && isHttpUrl(fileData)
      ? await fetchBuffer(fileData)
      : typeof fileData === 'string'
        ? Buffer.from(fileData, 'base64')
        : fileData;
    const media = new MessageMedia(
      request.file?.mimetype || 'application/octet-stream',
      buf.toString('base64'),
      request.file?.filename || 'file',
    );
    const msg = await this.client!.sendMessage(chatId, media, {
      caption: request.caption,
    });
    return this.wrapMessage(msg);
  }

  async sendVoice(request: MessageVoiceRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const fileData = this.fileToBuffer(request.file);
    const buf = typeof fileData === 'string' && isHttpUrl(fileData)
      ? await fetchBuffer(fileData)
      : typeof fileData === 'string'
        ? Buffer.from(fileData, 'base64')
        : fileData;
    const media = new MessageMedia(
      request.file?.mimetype || 'audio/ogg',
      buf.toString('base64'),
    );
    const msg = await this.client!.sendMessage(chatId, media, {
      sendAudioAsVoice: request.convert !== false,
    });
    return this.wrapMessage(msg);
  }

  async sendVideo(request: MessageVideoRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const fileData = this.fileToBuffer(request.file);
    const buf = typeof fileData === 'string' && isHttpUrl(fileData)
      ? await fetchBuffer(fileData)
      : typeof fileData === 'string'
        ? Buffer.from(fileData, 'base64')
        : fileData;
    const media = new MessageMedia(
      request.file?.mimetype || 'video/mp4',
      buf.toString('base64'),
      request.file?.filename || 'video',
    );
    const msg = await this.client!.sendMessage(chatId, media, {
      caption: request.caption,
    });
    return this.wrapMessage(msg);
  }

  async sendLocation(request: MessageLocationRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const { Location } = await import('whatsapp-web.js');
    const loc = new Location(request.latitude, request.longitude, {
      name: request.title || '',
    });
    const msg = await this.client!.sendMessage(chatId, loc);
    return this.wrapMessage(msg);
  }

  async forwardMessage(request: MessageForwardRequest): Promise<WAMessage> {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);

    const chats = await this.client!.getChats();
    for (const chat of chats.slice(0, 10)) {
      try {
        const msgs = await chat.fetchMessages({ limit: 100 });
        const found = msgs.find((m) => m.id._serialized === request.messageId);
        if (found) {
          await found.forward(chatId);
          const destChat = await this.client!.getChatById(chatId);
          const sent = await destChat.fetchMessages({ limit: 5, fromMe: true });
          if (sent.length > 0) {
            return this.wrapMessage(sent[sent.length - 1]);
          }
          return { id: '', timestamp: Date.now(), from: '', fromMe: true, source: 'api', to: '' };
        }
      } catch {}
    }
    throw new Error(`Message ${request.messageId} not found for forwarding`);
  }

  async reply(request: MessageReplyRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const chat = await this.client!.getChatById(chatId);
    const msgs = await chat.fetchMessages({ limit: 100 });
    const target = msgs.find((m) => m.id._serialized === request.reply_to);
    if (!target) {
      throw new Error(`Message ${request.reply_to} not found for reply`);
    }
    const msg = await target.reply(request.text);
    return this.wrapMessage(msg);
  }

  async sendSeen(request: SendSeenRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const chat = await this.client!.getChatById(chatId);
    await chat.sendSeen();
  }

  async startTyping(request: ChatRequest): Promise<void> {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    try {
      const chat = await this.client!.getChatById(chatId);
      await chat.sendStateTyping();
    } catch {}
  }

  async stopTyping(request: ChatRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    try {
      const chat = await this.client!.getChatById(chatId);
      await chat.clearState();
    } catch {}
  }

  async setReaction(request: MessageReactionRequest) {
    this.ensureClientReady();
    const chatId = this.ensureSuffix(request.chatId);
    const chat = await this.client!.getChatById(chatId);
    const msgs = await chat.fetchMessages({ limit: 100 });
    const target = msgs.find((m) => m.id._serialized === request.messageId);
    if (!target) {
      this.logger.warn(`Message ${request.messageId} not found for reaction`);
      return;
    }
    await (target as any).react(request.reaction);
  }

  async checkNumberStatus(request: CheckNumberStatusQuery): Promise<WANumberExistResult> {
    this.ensureClientReady();
    const phone = request.phone;
    const numberId = await this.client!.getNumberId(phone);
    return {
      exists: numberId !== null,
      isBusiness: false,
      canReceiveMessage: true,
      number: phone,
    };
  }

  // ------------------------------------------------------------------
  // Chats
  // ------------------------------------------------------------------

  async getChats(pagination?: PaginationParams) {
    this.ensureClientReady();
    const chats = await this.client!.getChats();
    return chats
      .filter((c) => c.id?._serialized)
      .map((c) => ({
        id: c.id._serialized,
        name: c.name || c.id._serialized,
        isGroup: Boolean(c.isGroup),
        unreadCount: c.unreadCount || 0,
        lastMessage: c.lastMessage
          ? {
              id: c.lastMessage.id?._serialized || '',
              from: c.lastMessage.from || '',
              to: c.lastMessage.to || '',
              body: c.lastMessage.body || '',
              type: mapWwebjsMessageType(c.lastMessage.type || 'text'),
              timestamp: c.lastMessage.timestamp || 0,
              isFromMe: c.lastMessage.fromMe || false,
            }
          : undefined,
      }));
  }

  async getChatMessages(
    chatId: string,
    query: GetChatMessagesQuery,
    filter: GetChatMessagesFilter,
  ): Promise<WAMessage[]> {
    this.ensureClientReady();
    const jid = this.ensureSuffix(chatId);
    const chat = await this.client!.getChatById(jid);
    const limit = query?.limit || 50;
    const msgs = await chat.fetchMessages({ limit });
    return msgs.map((m) => this.mapMessageToWAMessage(m));
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
    const jid = this.ensureSuffix(chatId);
    const chat = await this.client!.getChatById(jid);
    const msgs = await chat.fetchMessages({ limit: 100 });
    const found = msgs.find((m) => m.id._serialized === messageId);
    return found ? this.mapMessageToWAMessage(found) : null;
  }

  async deleteMessage(chatId: string, messageId: string) {
    this.ensureClientReady();
    const jid = this.ensureSuffix(chatId);
    const chat = await this.client!.getChatById(jid);
    const msgs = await chat.fetchMessages({ limit: 100 });
    const target = msgs.find((m) => m.id._serialized === messageId || m.id.id === messageId);
    if (!target) {
      this.logger.warn(`Message ${messageId} not found for deletion`);
      return;
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

  async getGroup(id: string) {
    this.ensureClientReady();
    try {
      const chat = await this.client!.getChatById(this.ensureSuffix(id));
      if (!chat.isGroup) return null;
      return {
        id: chat.id._serialized,
        name: chat.name || '',
        description: (chat as any).description || undefined,
        participants: ((chat as any).participants || []).map((p: any) => ({
          id: p.id._serialized,
          isAdmin: Boolean(p.isAdmin),
          isSuperAdmin: Boolean(p.isSuperAdmin),
        })),
        owner: (chat as any).owner?._serialized || undefined,
      };
    } catch {
      return null;
    }
  }

  async getGroupParticipants(id: string): Promise<GroupParticipant[]> {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) return [];
    return ((chat as any).participants || []).map((p: any) => ({
      id: p.id._serialized,
      isAdmin: Boolean(p.isAdmin),
      isSuperAdmin: Boolean(p.isSuperAdmin),
    }));
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
    const participants = request.participants.map((p) =>
      p.includes('@') ? p : `${p}@c.us`,
    );
    const result = await this.client!.createGroup(request.name, participants) as any;
    return {
      id: result.gid._serialized,
      name: request.name,
      participants,
    };
  }

  async addParticipants(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    const ids = (request.participants || []).map((p) =>
      p.includes('@') ? p : `${p}@c.us`,
    );
    await (chat as any).addParticipants(ids);
  }

  async removeParticipants(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    const ids = (request.participants || []).map((p) =>
      p.includes('@') ? p : `${p}@c.us`,
    );
    await (chat as any).removeParticipants(ids);
  }

  async leaveGroup(id: string) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    await (chat as any).leave();
  }

  async setDescription(id: string, description: string) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    await (chat as any).setDescription(description);
  }

  async setSubject(id: string, subject: string) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    await (chat as any).setSubject(subject);
  }

  async getInviteCode(id: string): Promise<string> {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    return (chat as any).getInviteCode();
  }

  async revokeInviteCode(id: string): Promise<string> {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    return (chat as any).revokeInviteCode();
  }

  async promoteParticipantsToAdmin(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    const ids = (request.participants || []).map((p) =>
      p.includes('@') ? p : `${p}@c.us`,
    );
    await (chat as any).promoteParticipants(ids);
  }

  async demoteParticipantsToUser(id: string, request: ParticipantsRequest) {
    this.ensureClientReady();
    const chat = await this.client!.getChatById(this.ensureSuffix(id));
    if (!chat.isGroup) throw new Error('Chat is not a group');
    const ids = (request.participants || []).map((p) =>
      p.includes('@') ? p : `${p}@c.us`,
    );
    await (chat as any).demoteParticipants(ids);
  }

  // ------------------------------------------------------------------
  // Presence
  // ------------------------------------------------------------------

  async setPresence(presence: WAHAPresenceStatus, chatId?: string): Promise<void> {
    if (!this.client) return;
    try {
      if (chatId) {
        const chat = await this.client!.getChatById(this.ensureSuffix(chatId));
        if (presence === WAHAPresenceStatus.TYPING) {
          await chat.sendStateTyping();
        } else if (presence === WAHAPresenceStatus.RECORDING) {
          await chat.sendStateRecording();
        } else {
          await chat.clearState();
        }
      }
    } catch {
      // Presence is best-effort
    }
  }

  async getPresences() {
    return [];
  }

  async getPresence(id: string) {
    return { chatId: id, presences: {} };
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private ensureClientReady(): void {
    if (!this.client) {
      throw new Error('Session is not started. Start the session first.');
    }
    if (this.status !== WAHASessionStatus.WORKING) {
      throw new Error('Session is not ready yet');
    }
  }

  private fileToBuffer(file: any): Buffer | string {
    if (typeof file === 'string') {
      return file;
    }
    if (file && typeof file === 'object' && file.data) {
      const base64 = file.data.includes(',') ? file.data.split(',')[1] : file.data;
      return Buffer.from(base64, 'base64');
    }
    return file;
  }

  protected ensureSuffix(phone: string): string {
    if (phone.includes('@')) return phone;
    return `${phone}@c.us`;
  }

  private mapIncomingMessage(msg: any): any {
    return {
      id: msg.id?._serialized || '',
      from: msg.from || '',
      to: msg.to || '',
      body: msg.body || '',
      type: mapWwebjsMessageType(msg.type || 'text'),
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      isForwarded: Boolean(msg.isForwarded),
      isFromMe: Boolean(msg.fromMe),
      hasMedia: Boolean(msg.hasMedia),
      mediaMimeType: msg._data?.mimetype || undefined,
    };
  }

  private mapMessageToWAMessage(msg: any): WAMessage {
    return {
      id: msg.id?._serialized || '',
      from: msg.from || '',
      to: msg.to || '',
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      fromMe: Boolean(msg.fromMe),
      source: msg.fromMe ? 'api' : 'app',
      body: msg.body || '',
      hasMedia: Boolean(msg.hasMedia),
    };
  }

  private wrapMessage(msg: any): WAMessage {
    return {
      id: msg.id?._serialized || '',
      from: msg.from || '',
      to: msg.to || '',
      timestamp: Math.floor(Date.now() / 1000),
      fromMe: true,
      source: 'api',
      body: '',
    };
  }
}

/**
 * whatsapp-web.js Engine Adapter
 *
 * Implements the IWhatsAppEngine interface using the whatsapp-web.js library
 * backed by Puppeteer/Chromium. Ported from OpenWA's adapter and adapted to
 * the WAHA-Bun engine interface contract.
 */

import { EventEmitter } from 'events';
import {
  Client,
  LocalAuth,
  MessageMedia,
  MessageTypes,
  WAState,
} from 'whatsapp-web.js';
// @ts-ignore — qrcode lacks bundled type declarations
import * as qrcode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import type {
  EngineType,
  IWhatsAppEngine,
  EngineSessionConfig,
  EngineContact,
  EngineChat,
  EngineGroupMetadata,
  EngineMessage,
  EngineProfile,
  MessageType,
} from '../interface';

// ---------------------------------------------------------------------------
// Chrome path — prefer env override, fall back to the known system location.
// ---------------------------------------------------------------------------
const CHROME_PATH =
  process.env.CHROME_PATH ||
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  '/usr/bin/google-chrome';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map whatsapp-web.js ack integer → engine-neutral delivery hint (string). */
function wwebjsAckToDeliveryStatus(
  ack: number,
): 'failed' | 'read' | 'delivered' | 'sent' | 'pending' {
  if (ack < 0) return 'failed';
  if (ack >= 3) return 'read';
  if (ack === 2) return 'delivered';
  if (ack === 1) return 'sent';
  return 'pending';
}

/** Map wwebjs message type string → engine-neutral MessageType. */
function mapMessageType(wwebjsType: string): MessageType {
  const typeMap: Record<string, MessageType> = {
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
  return typeMap[wwebjsType] || 'unknown';
}

/** Whether a string is an HTTP(S) URL. */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Whether a proxy URL uses a scheme we support. */
function isSupportedProxyUrl(url: string): boolean {
  try {
    return ['http:', 'https:', 'socks4:', 'socks5:'].includes(
      new URL(url).protocol,
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Engine status — mirrors what the session layer expects
// ---------------------------------------------------------------------------
enum EngineStatus {
  DISCONNECTED = 'disconnected',
  INITIALIZING = 'initializing',
  QR_READY = 'qr_ready',
  AUTHENTICATING = 'authenticating',
  READY = 'working',
  FAILED = 'failed',
}

// ---------------------------------------------------------------------------
// Types carried over from OpenWA for internal use
// ---------------------------------------------------------------------------
interface GroupChat {
  participants?: Array<{
    id: { _serialized: string; user: string };
    name?: string;
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
  }>;
  description?: string;
  owner?: { _serialized: string };
  createdAt?: number;
  isReadOnly?: boolean;
  isAnnounce?: boolean;
  groupMetadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export class WhatsAppWebJsAdapter
  extends EventEmitter
  implements IWhatsAppEngine
{
  readonly type: EngineType = 'webjs';

  private client: Client | null = null;
  private status: EngineStatus = EngineStatus.DISCONNECTED;
  private qrCode: string | null = null;
  private phoneNumber: string | null = null;
  private pushName: string | null = null;
  private tearingDown = false;
  private readyReconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private readyReconcileStartedAt = 0;
  private stuckAuthRecoveryAttempted = false;

  private sessionId = 'default';
  private sessionDataPath = path.join(process.cwd(), '.sessions', 'webjs');
  private proxyConfig?: EngineSessionConfig['proxy'];
  private authTimeout?: number;

  private logger = {
    info: (msg: string, ...args: any[]) =>
      console.log(`[WhatsAppWebJs] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) =>
      console.warn(`[WhatsAppWebJs] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) =>
      console.error(`[WhatsAppWebJs] ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) =>
      console.debug(`[WhatsAppWebJs] ${msg}`, ...args),
  };

  // ------------------------------------------------------------------
  // IWhatsAppEngine implementation
  // ------------------------------------------------------------------

  async initialize(config: EngineSessionConfig): Promise<void> {
    this.status = EngineStatus.INITIALIZING;
    this.proxyConfig = config.proxy;
    if (config.authTimeout) this.authTimeout = config.authTimeout;

    try {
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ];

      // Add proxy if configured
      if (this.proxyConfig) {
        const proxyUrl = this.proxyConfig.server;
        if (isSupportedProxyUrl(proxyUrl)) {
          puppeteerArgs.push(`--proxy-server=${proxyUrl}`);
          this.logger.info(`Using proxy: ${proxyUrl}`);
        } else {
          this.logger.warn(`Ignoring invalid proxy URL: ${proxyUrl}`);
        }
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: this.sessionId,
          dataPath: path.resolve(this.sessionDataPath),
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
    } catch (error) {
      this.status = EngineStatus.FAILED;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.client) return;
    this.tearingDown = true;
    this.clearReadyReconcile();
    try {
      await this.client.destroy();
    } catch {
      // ignore — may already be torn down
    } finally {
      this.client = null;
      this.status = EngineStatus.DISCONNECTED;
      this.tearingDown = false;
    }
  }

  // ---- Messaging ---------------------------------------------------------

  async sendText(chatId: string, text: string): Promise<string> {
    this.ensureReady();
    const msg = await this.client!.sendMessage(chatId, text);
    return msg.id._serialized;
  }

  async sendImage(
    chatId: string,
    buffer: Buffer,
    caption?: string,
    mimeType?: string,
  ): Promise<string> {
    return this.sendMediaMessage(chatId, buffer, 'image', caption, mimeType);
  }

  async sendVideo(
    chatId: string,
    buffer: Buffer,
    caption?: string,
  ): Promise<string> {
    return this.sendMediaMessage(chatId, buffer, 'video', caption);
  }

  async sendAudio(chatId: string, buffer: Buffer): Promise<string> {
    return this.sendMediaMessage(chatId, buffer, 'audio');
  }

  async sendDocument(
    chatId: string,
    buffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<string> {
    this.ensureReady();
    const media = new MessageMedia(
      mimeType || 'application/octet-stream',
      buffer.toString('base64'),
      filename,
    );
    const msg = await this.client!.sendMessage(chatId, media);
    return msg.id._serialized;
  }

  async sendLocation(
    chatId: string,
    lat: number,
    lng: number,
    title?: string,
  ): Promise<string> {
    this.ensureReady();
    const mod = await import('whatsapp-web.js');
    const Location = mod.Location || (mod as any).default?.Location;
    if (!Location) throw new Error('Location class not available from whatsapp-web.js');
    const loc = new Location(lat, lng, { name: title || '', address: title || '' });
    const msg = await this.client!.sendMessage(chatId, loc);
    return msg.id._serialized;
  }

  async sendContact(
    chatId: string,
    contacts: Array<{ name: string; phone: string }>,
  ): Promise<string> {
    this.ensureReady();
    const vcards = contacts
      .map(
        (c) =>
          [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${c.name}`,
            `TEL;type=CELL;type=VOICE;waid=${c.phone}:+${c.phone}`,
            'END:VCARD',
          ].join('\n'),
      )
      .join('\n\n');
    const msg = await this.client!.sendMessage(chatId, vcards, {
      parseVCards: true,
    });
    return msg.id._serialized;
  }

  async sendSticker(
    chatId: string,
    buffer: Buffer,
    mimeType?: string,
  ): Promise<string> {
    this.ensureReady();
    const media = new MessageMedia(
      mimeType || 'image/webp',
      buffer.toString('base64'),
    );
    const msg = await this.client!.sendMessage(chatId, media, {
      sendMediaAsSticker: true,
    });
    return msg.id._serialized;
  }

  async sendReaction(
    chatId: string,
    messageId: string,
    emoji: string,
  ): Promise<void> {
    this.ensureReady();
    try {
      const chat = await this.client!.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit: 100 });
      const message = messages.find(
        (m) => m.id._serialized === messageId,
      );
      if (!message) {
        this.logger.warn(`Message ${messageId} not found for reaction`);
        return;
      }
      await (message as any).react(emoji);
    } catch (error) {
      this.logger.error(
        `Error sending reaction to ${messageId}: ${String(error)}`,
      );
    }
  }

  async sendSeen(chatId: string): Promise<void> {
    this.ensureReady();
    try {
      const chat = await this.client!.getChatById(chatId);
      await chat.sendSeen();
    } catch (error) {
      this.logger.error(`Error marking chat ${chatId} as seen: ${String(error)}`);
    }
  }

  async startTyping(chatId: string): Promise<void> {
    this.ensureReady();
    try {
      const chat = await this.client!.getChatById(chatId);
      await chat.sendStateTyping();
    } catch {
      // presence is best-effort
    }
  }

  async stopTyping(chatId: string): Promise<void> {
    this.ensureReady();
    try {
      const chat = await this.client!.getChatById(chatId);
      await chat.clearState();
    } catch {
      // presence is best-effort
    }
  }

  // ---- Contacts ----------------------------------------------------------

  async getContacts(): Promise<EngineContact[]> {
    this.ensureReady();
    const contacts = await this.client!.getContacts();
    return contacts.map((c) => ({
      id: c.id._serialized,
      name: c.name || c.pushname || '',
      phone: c.number,
      pushName: c.pushname || undefined,
      isBusiness: (c as any).isBusiness || false,
      isMyContact: c.isMyContact || false,
      profilePicture: undefined,
    }));
  }

  async checkNumberExists(phone: string): Promise<boolean> {
    const id = await this.getNumberId(phone);
    return id !== null;
  }

  async getContactById(contactId: string): Promise<EngineContact | null> {
    this.ensureReady();
    try {
      const c = await this.client!.getContactById(contactId);
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

  async getNumberId(phone: string): Promise<string | null> {
    this.ensureReady();
    try {
      const numberId = await this.client!.getNumberId(phone);
      return numberId?._serialized ?? null;
    } catch {
      return null;
    }
  }

  // ---- Chats -------------------------------------------------------------

  async getChats(): Promise<EngineChat[]> {
    this.ensureReady();
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
              type: mapMessageType(c.lastMessage.type || 'text'),
              timestamp: c.lastMessage.timestamp || 0,
              isFromMe: c.lastMessage.fromMe || false,
            }
          : undefined,
      }));
  }

  async getMessages(
    chatId: string,
    limit: number = 50,
  ): Promise<EngineMessage[]> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    return messages.map((m) => this.mapMessage(m));
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 100 });
    const msg = messages.find(
      (m) => m.id._serialized === messageId || m.id.id === messageId,
    );
    if (!msg) {
      this.logger.warn(`Message ${messageId} not found for deletion`);
      return;
    }
    await msg.delete(true);
  }

  async forwardMessage(chatId: string, messageId: string): Promise<string> {
    this.ensureReady();
    // Find message across all chats — search the most recent messages
    const allChats = await this.client!.getChats();
    for (const chat of allChats.slice(0, 10)) {
      try {
        const msgs = await chat.fetchMessages({ limit: 100 });
        const msg = msgs.find((m) => m.id._serialized === messageId);
        if (msg) {
          await msg.forward(chatId);
          // best-effort recover sent id
          try {
            const destChat = await this.client!.getChatById(chatId);
            const sent = await destChat.fetchMessages({
              limit: 5,
              fromMe: true,
            });
            if (sent.length > 0) {
              return sent[sent.length - 1].id._serialized;
            }
          } catch {
            // fall through
          }
          return '';
        }
      } catch {
        // skip chat
      }
    }
    this.logger.warn(`Message ${messageId} not found for forwarding`);
    return '';
  }

  async markChatAsRead(chatId: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(chatId);
    await chat.sendSeen();
  }

  // ---- Profile / Groups --------------------------------------------------

  async getProfilePicture(chatId: string): Promise<string | null> {
    this.ensureReady();
    try {
      const url = await this.client!.getProfilePicUrl(chatId);
      return url || null;
    } catch {
      return null;
    }
  }

  async getGroupMetadata(groupId: string): Promise<EngineGroupMetadata | null> {
    this.ensureReady();
    try {
      const chat = await this.client!.getChatById(groupId);
      if (!chat.isGroup) return null;
      const gc = chat as unknown as GroupChat;
      return {
        id: chat.id._serialized,
        name: chat.name || '',
        description: gc.description || undefined,
        participants: (gc.participants || []).map((p) => ({
          id: p.id._serialized,
          isAdmin: Boolean(p.isAdmin),
          isSuperAdmin: Boolean(p.isSuperAdmin),
        })),
      };
    } catch {
      return null;
    }
  }

  async getGroupMembers(groupId: string): Promise<EngineContact[]> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) return [];
    const gc = chat as unknown as GroupChat;
    return (gc.participants || []).map((p) => ({
      id: p.id._serialized,
      name: p.name || p.id.user || '',
      phone: p.id.user || '',
    }));
  }

  async addGroupMembers(
    groupId: string,
    participants: string[],
  ): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) throw new Error('Chat is not a group');
    const ids = participants.map((p) => (p.includes('@') ? p : `${p}@c.us`));
    await (chat as unknown as GroupChat).participants?.length;
    // Use the wwebjs addParticipants method
    await (chat as any).addParticipants(ids);
  }

  async removeGroupMembers(
    groupId: string,
    participants: string[],
  ): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) throw new Error('Chat is not a group');
    const ids = participants.map((p) => (p.includes('@') ? p : `${p}@c.us`));
    await (chat as any).removeParticipants(ids);
  }

  async leaveGroup(groupId: string): Promise<void> {
    this.ensureReady();
    const chat = await this.client!.getChatById(groupId);
    if (!chat.isGroup) throw new Error('Chat is not a group');
    await (chat as any).leave();
  }

  // ---- QR / Pairing ------------------------------------------------------

  async getQrCode(): Promise<string | null> {
    return this.qrCode;
  }

  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.client) {
      throw new Error('Engine is not initialized');
    }
    return this.client.requestPairingCode(phoneNumber);
  }

  // ---- Status / Profile --------------------------------------------------

  async getStatus(): Promise<string> {
    return this.status;
  }

  async getMe(): Promise<EngineProfile | null> {
    if (this.status !== EngineStatus.READY || !this.client) return null;
    try {
      const info = this.client.info;
      return {
        id: info?.wid?._serialized || '',
        name: info?.pushname || '',
        phone: info?.wid?.user || '',
        profilePicture: undefined,
      };
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  private async sendMediaMessage(
    chatId: string,
    buffer: Buffer,
    mediaType: 'image' | 'video' | 'audio',
    caption?: string,
    mimeType?: string,
  ): Promise<string> {
    this.ensureReady();
    const mime =
      mimeType ||
      (mediaType === 'image'
        ? 'image/png'
        : mediaType === 'video'
          ? 'video/mp4'
          : 'audio/ogg');
    const media = new MessageMedia(mime, buffer.toString('base64'));
    const msg = await this.client!.sendMessage(chatId, media, {
      caption,
    });
    return msg.id._serialized;
  }

  private mapMessage(msg: any): EngineMessage {
    return {
      id: msg.id?._serialized || '',
      from: msg.from || '',
      to: msg.to || '',
      body: msg.body || '',
      type: mapMessageType(msg.type || 'text'),
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      isForwarded: Boolean(msg.isForwarded),
      isFromMe: Boolean(msg.fromMe),
      hasMedia: Boolean(msg.hasMedia),
      mediaUrl: undefined,
      mediaMimeType: msg._data?.mimetype || undefined,
      caption: msg.body || undefined,
      quotedMessage: msg.hasQuotedMsg
        ? undefined // quoted resolved lazily; populate if needed
        : undefined,
    };
  }

  // ------------------------------------------------------------------
  // Event handling — map wwebjs events → engine events
  // ------------------------------------------------------------------

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('qr', async (qr: string) => {
      try {
        this.qrCode = await qrcode.toDataURL(qr);
        this.setStatus(EngineStatus.QR_READY);
        this.emit('session_status', {
          status: 'QR_READY',
          qr: this.qrCode,
        });
      } catch (error) {
        this.logger.error(`Error generating QR: ${String(error)}`);
      }
    });

    this.client.on('authenticated', () => {
      if (
        this.tearingDown ||
        this.status === EngineStatus.AUTHENTICATING ||
        this.status === EngineStatus.READY ||
        this.status === EngineStatus.FAILED
      ) {
        return;
      }
      this.setStatus(EngineStatus.AUTHENTICATING);
      this.qrCode = null;
      this.scheduleReadyReconcile();
    });

    this.client.on('ready', () => {
      this.markReadyFromClientInfo();
    });

    this.client.on('message', async (msg: any) => {
      try {
        const incoming = this.mapMessage(msg);

        // Attach sender contact
        try {
          const contact = await msg.getContact();
          if (contact) {
            incoming.from =
              contact.id?._serialized || incoming.from;
          }
        } catch {
          // best-effort
        }

        // Handle media
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media) {
              incoming.hasMedia = true;
              incoming.mediaMimeType = media.mimetype;
            }
          } catch (error) {
            this.logger.error(`Error downloading media: ${String(error)}`);
          }
        }

        // Handle quoted message
        if (msg.hasQuotedMsg) {
          try {
            const quoted = await msg.getQuotedMessage();
            incoming.quotedMessage = {
              id: quoted.id._serialized,
              from: quoted.from || '',
              to: quoted.to || '',
              body: quoted.body || '',
              type: mapMessageType(quoted.type || 'text'),
              timestamp: quoted.timestamp || 0,
              isFromMe: Boolean(quoted.fromMe),
            };
          } catch {
            // best-effort
          }
        }

        this.emit('message', incoming);
      } catch (error) {
        this.logger.error(`Error processing message: ${String(error)}`);
      }
    });

    this.client.on('message_create', (msg: any) => {
      // Only forward own outgoing messages
      if (!msg.fromMe) return;
      try {
        this.emit('message', this.mapMessage(msg));
      } catch (error) {
        this.logger.error(`Error processing message_create: ${String(error)}`);
      }
    });

    this.client.on('message_ack', (msg: any, ack: number) => {
      this.emit('message_ack', {
        id: msg.id?._serialized || '',
        status: wwebjsAckToDeliveryStatus(ack),
      });
    });

    this.client.on('message_revoke_everyone', (after: any) => {
      try {
        this.emit('message_revoked', {
          id: after.id._serialized,
          chatId: after.from || '',
          from: after.from,
          to: after.to,
          timestamp: after.timestamp,
        });
      } catch (error) {
        this.logger.error(`Error processing revoke: ${String(error)}`);
      }
    });

    this.client.on('message_reaction', (reaction: any) => {
      try {
        this.emit('message_reaction', {
          messageId: reaction.msgId?._serialized || '',
          chatId: reaction.id?.remote || '',
          reaction: reaction.reaction,
          senderId: reaction.senderId || '',
        });
      } catch (error) {
        this.logger.error(`Error processing reaction: ${String(error)}`);
      }
    });

    this.client.on('disconnected', (reason: string) => {
      this.clearReadyReconcile();
      this.setStatus(EngineStatus.DISCONNECTED);
      this.emit('session_status', {
        status: 'DISCONNECTED',
        reason,
      });
    });

    this.client.on('auth_failure', (message?: string) => {
      this.clearReadyReconcile();
      this.setStatus(EngineStatus.FAILED);
      this.emit('session_status', {
        status: 'FAILED',
        reason: message || 'Authentication failed',
      });
    });
  }

  // ------------------------------------------------------------------
  // Readiness reconciliation — detect when wwebjs misses the 'ready' event
  // ------------------------------------------------------------------

  private markReadyFromClientInfo(): void {
    if (
      [EngineStatus.READY, EngineStatus.DISCONNECTED, EngineStatus.FAILED].includes(
        this.status,
      )
    )
      return;
    this.clearReadyReconcile();
    try {
      const info = this.client?.info;
      this.phoneNumber = info?.wid?.user || null;
      this.pushName = info?.pushname || null;
      this.setStatus(EngineStatus.READY);
      this.emit('session_status', {
        status: 'WORKING',
        phone: this.phoneNumber,
        pushName: this.pushName,
      });
    } catch (error) {
      this.logger.error(`Error getting client info: ${String(error)}`);
      this.setStatus(EngineStatus.READY);
      this.emit('session_status', { status: 'WORKING' });
    }
  }

  private scheduleReadyReconcile(): void {
    this.clearReadyReconcile();
    this.readyReconcileStartedAt = Date.now();

    const tick = (): void => {
      if (!this.client || this.status !== EngineStatus.AUTHENTICATING) {
        this.clearReadyReconcile();
        return;
      }

      if (Date.now() - this.readyReconcileStartedAt >= 90_000) {
        this.logger.warn(
          'Timed out waiting for readiness after authentication — clearing for re-pairing',
        );
        this.clearReadyReconcile();
        void this.recoverFromStuckAuth();
        return;
      }

      this.readyReconcileTimer = setTimeout(tick, 2000);
      this.readyReconcileTimer.unref?.();

      // Check if client is now connected
      void this.isClientRuntimeReady().then((ready) => {
        if (
          ready &&
          this.client &&
          this.status === EngineStatus.AUTHENTICATING
        ) {
          this.logger.warn('Ready event missed; reconciling from runtime state');
          this.markReadyFromClientInfo();
        }
      }).catch(() => {
        // probe failed — will retry next tick
      });
    };

    this.readyReconcileTimer = setTimeout(tick, 2000);
    this.readyReconcileTimer.unref?.();
  }

  private clearReadyReconcile(): void {
    if (this.readyReconcileTimer) {
      clearTimeout(this.readyReconcileTimer);
      this.readyReconcileTimer = null;
    }
    this.readyReconcileStartedAt = 0;
  }

  private async isClientRuntimeReady(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const state = await this.client.getState();
      return state === WAState.CONNECTED;
    } catch {
      return false;
    }
  }

  private async recoverFromStuckAuth(): Promise<void> {
    if (this.stuckAuthRecoveryAttempted) {
      this.setStatus(EngineStatus.FAILED);
      this.emit('session_status', {
        status: 'FAILED',
        reason: 'Could not reach readiness after re-pairing',
      });
      return;
    }
    this.stuckAuthRecoveryAttempted = true;

    const client = this.client;
    this.client = null;
    await this.clearLocalAuth();
    this.setStatus(EngineStatus.DISCONNECTED);
    this.emit('session_status', {
      status: 'DISCONNECTED',
      reason: 'Session cleared for re-pairing',
    });
    if (typeof client?.destroy === 'function')
      void client.destroy().catch(() => undefined);
  }

  private async clearLocalAuth(): Promise<void> {
    const dir = path.join(
      path.resolve(this.sessionDataPath),
      `session-${this.sessionId}`,
    );
    await fs.promises
      .rm(dir, { recursive: true, force: true })
      .catch((error: unknown) => {
        this.logger.warn(`Could not clear auth at ${dir}: ${String(error)}`);
      });
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.emit('stateChanged', status);
  }

  private ensureReady(): void {
    if (this.status !== EngineStatus.READY || !this.client) {
      throw new Error(
        `Engine not ready (status: ${this.status}). Call initialize() first.`,
      );
    }
  }
}

export default WhatsAppWebJsAdapter;

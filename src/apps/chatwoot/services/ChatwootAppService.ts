import axios, { AxiosInstance } from 'axios';
import pino from 'pino';
import { ChatwootAppConfig, ChatwootWebhookPayload } from '../dto/chatwoot-config.dto';
import { ChatwootAppRepository } from '../storage/ChatwootAppRepository';
import { SessionManager } from '../../../core/manager.core';
import { WAHAEvents } from '../../../structures/enums.dto';

interface ChatwootContact {
  id: number;
  name: string;
  phone_number: string;
  contact_inbox: {
    source_id: string;
  };
}

interface ChatwootConversation {
  id: number;
  status: string;
}

export class ChatwootAppService {
  private repository: ChatwootAppRepository;
  private logger: pino.Logger;
  private initialized = false;
  private subscriptions: (() => void)[] = [];

  constructor() {
    this.repository = new ChatwootAppRepository();
    this.logger = pino({ name: 'ChatwootAppService' });
  }

  async init(sessionManager: SessionManager): Promise<void> {
    if (this.initialized) return;

    await this.repository.init();
    this.logger.info(`Chatwoot app initialized with ${(await this.repository.findAll()).length} config(s)`);

    // Subscribe to WhatsApp message events for all enabled apps
    await this.subscribeToEvents(sessionManager);

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.subscriptions) {
      try { unsub(); } catch {}
    }
    this.subscriptions = [];
    this.initialized = false;
  }

  // ── CRUD ───────────────────────────────────────────────────────

  async listApps(): Promise<ChatwootAppConfig[]> {
    return this.repository.findAll();
  }

  async getApp(id: string): Promise<ChatwootAppConfig | null> {
    return this.repository.findById(id);
  }

  async createApp(config: Omit<ChatwootAppConfig, 'id'>): Promise<ChatwootAppConfig> {
    const app: ChatwootAppConfig = {
      ...config,
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      app: 'chatwoot',
    };
    await this.repository.save(app);
    this.logger.info({ appId: app.id, session: app.session }, 'Chatwoot app created');
    return app;
  }

  async updateApp(id: string, updates: Partial<ChatwootAppConfig>): Promise<ChatwootAppConfig | null> {
    const existing = await this.repository.findById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id, app: 'chatwoot' as const };
    await this.repository.save(updated);
    this.logger.info({ appId: id }, 'Chatwoot app updated');
    return updated;
  }

  async deleteApp(id: string): Promise<boolean> {
    const existed = await this.repository.delete(id);
    if (existed) {
      this.logger.info({ appId: id }, 'Chatwoot app deleted');
    }
    return existed;
  }

  // ── EVENT SUBSCRIPTION ─────────────────────────────────────────

  private async subscribeToEvents(sessionManager: SessionManager): Promise<void> {
    const apps = await this.repository.findAllEnabled();
    if (apps.length === 0) {
      this.logger.info('No enabled Chatwoot apps — skipping event subscription');
      return;
    }

    // Subscribe to message events from each session that has a chatwoot app
    const subscribedSessions = new Set<string>();
    for (const app of apps) {
      if (subscribedSessions.has(app.session)) continue;
      subscribedSessions.add(app.session);

      try {
        const observable = sessionManager.getSessionEvent(app.session, WAHAEvents.MESSAGE_ANY);
        const sub = observable.subscribe({
          next: async (data: any) => {
            try {
              await this.handleIncomingMessage(app.session, data);
            } catch (err) {
              this.logger.error({ err, session: app.session }, 'Error handling incoming WhatsApp message');
            }
          },
          error: (err: any) => {
            this.logger.error({ err, session: app.session }, 'Event subscription error');
          },
        });
        this.subscriptions.push(() => sub.unsubscribe());
        this.logger.info({ session: app.session }, 'Subscribed to WhatsApp message events for Chatwoot');
      } catch (err) {
        this.logger.warn({ err, session: app.session }, 'Could not subscribe to events — session may not exist yet');
      }
    }
  }

  // ── INCOMING: WhatsApp → Chatwoot ──────────────────────────────

  private async handleIncomingMessage(session: string, data: any): Promise<void> {
    // Skip messages sent from WAHA itself (via API)
    const payload = data?.payload || data;
    if (payload?.fromMe) return;

    const app = await this.repository.findBySession(session);
    if (!app) return;

    const chatId = payload?.from || payload?.chatId;
    const body = payload?.body || '';
    const hasMedia = payload?.hasMedia;
    if (!chatId) return;

    this.logger.debug({ chatId, session, body: body.slice(0, 50) }, 'Forwarding incoming WhatsApp message to Chatwoot');

    await this.forwardToChatwoot(app, chatId, body, hasMedia ? payload : null, payload);
  }

  private async forwardToChatwoot(
    app: ChatwootAppConfig,
    chatId: string,
    text: string,
    media: any,
    rawPayload: any,
  ): Promise<void> {
    const { url, accountId, accountToken, inboxId } = app.config;
    const client = this.createChatwootClient(url, accountToken);

    try {
      // 1. Find or create the contact in Chatwoot
      const contact = await this.findOrCreateContact(client, accountId, inboxId, chatId, rawPayload);

      // 2. Find or create conversation
      const conversation = await this.findOrCreateConversation(
        client, accountId, inboxId, contact.id, chatId,
      );

      // 3. Create the message in the conversation
      await this.createMessage(client, accountId, conversation.id, text, media);
    } catch (err: any) {
      this.logger.error(
        { err: err.message, chatId, accountId },
        'Failed to forward message to Chatwoot',
      );
    }
  }

  private async findOrCreateContact(
    client: AxiosInstance,
    accountId: number,
    inboxId: number,
    chatId: string,
    payload: any,
  ): Promise<ChatwootContact> {
    // First try to find contact by source_id (WhatsApp chat ID)
    try {
      const filterRes = await client.post(`/api/v1/accounts/${accountId}/contacts/filter`, {
        payload: [{ attribute_key: 'source_id', filter_operator: 'equal', values: [chatId] }],
        inbox_id: inboxId,
      });
      const contacts: any[] = filterRes.data?.payload || filterRes.data || [];
      if (contacts.length > 0) {
        // Get full contact details
        const contactId = contacts[0].id;
        const detailRes = await client.get(`/api/v1/accounts/${accountId}/contacts/${contactId}`);
        return detailRes.data?.payload?.contact || detailRes.data?.contact || contacts[0];
      }
    } catch {
      // Filter might not be available — fall through to inbox lookup
    }

    // Try to find existing contact_inbox by source_id
    try {
      const inboxRes = await client.get(
        `/api/v1/accounts/${accountId}/contacts/${inboxId}/contact_inboxes`,
      );
      const inboxes: any[] = inboxRes.data?.payload || [];
      const existing = inboxes.find((i: any) => i.source_id === chatId);
      if (existing) {
        const detailRes = await client.get(`/api/v1/accounts/${accountId}/contacts/${existing.contact_id}`);
        return detailRes.data?.payload?.contact || detailRes.data?.contact || { id: existing.contact_id };
      }
    } catch {
      // Fall through to create
    }

    // Create new contact
    const pushName = payload?.pushName || payload?.notifyName || chatId;
    const phoneNumber = chatId.replace(/@[\w.]+$/, '');
    const createRes = await client.post(`/api/v1/accounts/${accountId}/contacts/inbox`, {
      inbox_id: inboxId,
      source_id: chatId,
      name: pushName,
      phone_number: phoneNumber,
      custom_attributes: {
        waha_whatsapp_jid: chatId,
      },
    });
    return createRes.data?.payload?.contact || createRes.data?.contact || createRes.data;
  }

  private async findOrCreateConversation(
    client: AxiosInstance,
    accountId: number,
    inboxId: number,
    contactId: number,
    sourceId: string,
  ): Promise<ChatwootConversation> {
    // Check for existing open conversations
    try {
      const convRes = await client.get(
        `/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
      );
      const conversations: ChatwootConversation[] = convRes.data?.payload || [];
      const open = conversations.find(
        (c) => c.status === 'open' || c.status === 'pending',
      );
      if (open) return open;
    } catch {
      // Fall through to create
    }

    // Create new conversation
    const res = await client.post(`/api/v1/accounts/${accountId}/conversations`, {
      inbox_id: inboxId,
      source_id: sourceId,
      contact_id: contactId,
      status: 'open',
    });
    return {
      id: res.data?.id || res.data?.conversation?.id,
      status: 'open',
    };
  }

  private async createMessage(
    client: AxiosInstance,
    accountId: number,
    conversationId: number,
    text: string,
    media: any,
  ): Promise<void> {
    const body: Record<string, any> = {
      content: text || (media ? media.body || '' : ''),
      message_type: 'incoming',
    };

    // Handle media attachments
    if (media?.hasMedia && media?.mediaUrl) {
      body.content = body.content || media.body || 'Media message';
      body.content_attributes = {
        ...(body.content_attributes || {}),
        media_url: media.mediaUrl,
        media_type: media.media?.mimetype || 'image',
      };
    }

    await client.post(
      `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      body,
    );
  }

  // ── OUTGOING: Chatwoot → WhatsApp (called from webhook handler) ─

  async handleChatwootWebhook(app: ChatwootAppConfig, payload: ChatwootWebhookPayload): Promise<void> {
    // Only process outgoing messages from Chatwoot (agent replies)
    if (!payload.message_type || payload.message_type !== 'outgoing') return;
    if (payload.private) return; // Skip internal notes

    const sourceId = payload.conversation?.contact_inbox?.source_id;
    if (!sourceId) return;

    const text = payload.content || '';
    if (!text) return;

    this.logger.debug(
      { conversationId: payload.conversation?.id, to: sourceId, text: text.slice(0, 50) },
      'Forwarding Chatwoot reply to WhatsApp',
    );

    // Send the message via WAHA's own API (internal HTTP call)
    const baseUrl = `http://localhost:${process.env.PORT || process.env.WHATSAPP_API_PORT || '3000'}`;
    const apiKey = process.env.WAHA_API_KEY;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['x-api-key'] = apiKey;
      }

      const messageBody: Record<string, any> = {
        session: app.session,
        chatId: sourceId,
        text: text,
      };

      // Handle attachments from Chatwoot
      if (payload.attachment) {
        messageBody.text = `[Media: ${payload.attachment.file_type || 'file'}]\n${text || ''}`;
      }

      await axios.post(`${baseUrl}/api/sendText`, messageBody, { headers });

      this.logger.info(
        { conversationId: payload.conversation?.id, to: sourceId },
        'Successfully forwarded Chatwoot reply to WhatsApp',
      );
    } catch (err: any) {
      this.logger.error(
        { err: err.message, conversationId: payload.conversation?.id },
        'Failed to forward Chatwoot reply to WhatsApp',
      );
    }
  }

  // ── WEBHOOK VERIFICATION ───────────────────────────────────────

  async verifyWebhookSignature(app: ChatwootAppConfig, body: any): Promise<boolean> {
    // Basic validation: check that the account_id in the payload matches the app
    if (body?.account?.id && body.account.id !== app.config.accountId) {
      this.logger.warn(
        { payloadAccountId: body.account.id, expectedAccountId: app.config.accountId },
        'Chatwoot webhook account_id mismatch',
      );
      return false;
    }
    return true;
  }

  // ── HELPERS ─────────────────────────────────────────────────────

  private createChatwootClient(baseUrl: string, accountToken: string): AxiosInstance {
    return axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      headers: {
        'Content-Type': 'application/json',
        'api_access_token': accountToken,
      },
      timeout: 15_000,
    });
  }
}

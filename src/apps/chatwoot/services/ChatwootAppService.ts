import axios, { AxiosInstance } from 'axios';
import pino from 'pino';
import { ChatwootAppConfig, ChatwootWebhookPayload } from '../dto/chatwoot-config.dto';
import { ChatwootAppRepository } from '../storage/ChatwootAppRepository';
import { SessionManager } from '../../../core/manager.core';
import { WAHAEvents } from '../../../structures/enums.dto';
import { verifyWebhookSignature as verifyHmac } from '../../../common/security/webhook-signing';

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

      // 4. Trigger Milo auto-reply via SocialFlow
      this.triggerMiloReply(url, accountToken, accountId, conversation.id, text, chatId, app.session).catch((err) => {
        this.logger.warn({ err: err.message, conversationId: conversation.id }, 'Milo auto-reply failed');
      });
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
    // First try to find contact by source_id (WhatsApp chat ID) via contact_inboxes filter
    try {
      const filterRes = await client.post(`/api/v1/accounts/${accountId}/contact_inboxes/filter`, {
        payload: [{ attribute_key: 'source_id', filter_operator: 'equal', values: [chatId] }],
        inbox_id: inboxId,
      });
      const inboxes: any[] = filterRes.data?.payload || [];
      if (inboxes.length > 0) {
        const ci = inboxes[0];
        const detailRes = await client.get(`/api/v1/accounts/${accountId}/contacts/${ci.contact_id}`);
        return detailRes.data?.payload?.contact || detailRes.data?.contact || { id: ci.contact_id, name: '', phone_number: '' };
      }
    } catch {
      // Filter might not be available — fall through to create
    }

    // Create new contact first
    const pushName = payload?.pushName || payload?.notifyName || chatId;
    const phoneNumber = chatId.replace(/@[\w.]+$/, '');
    const createContactRes = await client.post(`/api/v1/accounts/${accountId}/contacts`, {
      contact: {
        name: pushName,
        phone_number: phoneNumber,
        inbox_id: inboxId,
      },
    });
    const newContact: ChatwootContact = createContactRes.data?.payload?.contact || createContactRes.data?.contact;
    if (!newContact?.id) {
      throw new Error('Failed to create contact in Chatwoot');
    }

    // Link the contact to the WhatsApp inbox
    await client.post(`/api/v1/accounts/${accountId}/contacts/${newContact.id}/contact_inboxes`, {
      inbox_id: inboxId,
      source_id: chatId,
    });

    // Set custom attributes for WhatsApp identifiers
    try {
      await client.put(`/api/v1/accounts/${accountId}/contacts/${newContact.id}`, {
        contact: {
          custom_attributes: {
            waha_whatsapp_jid: chatId,
          },
        },
      });
    } catch {
      // Custom attributes update is optional
    }

    return newContact;
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

  // ── Trigger Milo auto-reply via SocialFlow ─────────────────────────
  //
  // After a WhatsApp message is forwarded to Chatwoot, we ask Milo
  // (SocialFlow's AI chatbot) to generate an automated reply. If Milo
  // is enabled and the API key is configured, a reply is posted back
  // to the Chatwoot conversation.

  private async triggerMiloReply(
    chatwootUrl: string,
    _accountToken: string,
    _accountId: number,
    conversationId: number,
    text: string,
    chatId?: string,
    session?: string,
  ): Promise<void> {
    const miloUrl = process.env.MILO_API_URL || 'http://localhost:3003/api/webhooks/chatwoot/milo';
    try {
      const resp = await fetch(miloUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          content: text,
          chatwoot_url: chatwootUrl,
          chat_id: chatId,
          session: session,
          platform: 'whatsapp',
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown');
        this.logger.warn({ status: resp.status, err: errText }, 'Milo API returned error');
      }
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'Failed to call Milo API');
    }
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

  async verifyWebhookSignature(app: ChatwootAppConfig, body: any, rawBody?: string, signature?: string): Promise<boolean> {
    // HMAC verification: if a webhookSecret is configured, require valid HMAC
    if (app.config.webhookSecret) {
      if (!rawBody || !signature) {
        this.logger.warn(
          { session: app.session },
          'Chatwoot webhook HMAC verification failed: missing signature header or body',
        );
        return false;
      }
      const valid = verifyHmac(rawBody, signature, app.config.webhookSecret);
      if (!valid) {
        this.logger.warn(
          { session: app.session },
          'Chatwoot webhook HMAC signature mismatch',
        );
        return false;
      }
      return true;
    }

    // No secret configured — warn and fall back to account_id check (legacy mode)
    if (!app.config.webhookSecret) {
      this.logger.warn(
        { session: app.session },
        'Chatwoot webhook secret not configured — using legacy account_id check',
      );
    }

    // Legacy fallback: check that the account_id in the payload matches the app
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

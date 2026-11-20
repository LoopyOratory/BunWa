/**
 * Chat runtime — the piece that answers inbound WhatsApp chats.
 *
 * Pipeline per the product spec, deliberately human-paced:
 *   read (sendSeen) -> typing indicator held a random 5.01-15.00 s ->
 *   stop typing -> send the reply.
 *
 * No engine is patched: this subscribes to the same normalized event stream
 * the /ws monitor uses (manager.getSessionEvents with MESSAGE and
 * MESSAGE_ANY) and drives the session's existing sendSeen / setPresence /
 * sendText surface. An agent opts in per session via
 * `settings.chat = { enabled: true, session: 'calltest' }`.
 *
 * Guardrails (platform rules, not options):
 * - The bot never replies while a human is active: any fromMe message the
 *   runtime did not send itself marks the chat human-active for 30 minutes
 *   (auto-handback), so an admin answering from their phone stops the bot
 *   from talking over them.
 * - Group chats and broadcasts are out of scope for v1 (skipped, logged once).
 * - Every turn is persisted through the runtime recorder, and the engagement
 *   heartbeat lights the "Chatting with X" badge during a reply.
 * - Model failures record a `model.error` event and send nothing — an
 *   error-reply loop is worse than a late reply.
 */

import type { SessionManager } from '../manager.core';
import { agentService } from './agent.service';
import { RuntimeRecorder } from './runtime-recorder';
import type { Agent, ModelSettingsSecrets } from './agent.types';
import { BUNWAPresenceStatus, BUNWAEvents } from '../../structures/enums.dto';

/** Typing hold bounds. 5.01 s floor on purpose: an even 5.0 s reads as a bot. */
const TYPING_MIN_MS = Number(process.env.BUNWA_CHAT_TYPING_MIN_MS || 5010);
const TYPING_MAX_MS = Number(process.env.BUNWA_CHAT_TYPING_MAX_MS || 15000);
/** A human reply silences the bot for this long, then it hands back. */
const HUMAN_ACTIVE_HAND_BACK_MINUTES = Number(process.env.BUNWA_CHAT_HAND_BACK_MINUTES || 30);
/** How long the model may take before the reply is abandoned (ms). */
const MODEL_TIMEOUT_MS = 45_000;
/** Conversation turns included as history for the model. */
const HISTORY_TURNS = 12;

export interface NormalizedChatMessage {
  id: string;
  from: string;
  to: string;
  author?: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe: boolean;
  hasMedia?: boolean;
}

interface ChatRuntimeDeps {
  manager: SessionManager;
  logger?: Pick<Console, 'info' | 'warn'>;
  /** Injectable clock/sleep/rng for tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  randomTypingMs?: () => number;
  fetchImpl?: typeof fetch;
  /** Injectable bindings/recorder/model-settings for tests. */
  resolveAgentId?: (session: string) => Promise<string>;
  makeRecorder?: (agentId: string, chatId: string) => RuntimeRecorder;
  getModelSettings?: () => Promise<ModelSettingsSecrets | null>;
}

const isGroup = (jid: string) => jid.endsWith('@g.us');
const isBroadcast = (jid: string) => jid.endsWith('@broadcast') || jid.endsWith('@status');

class ChatRuntimeService {
  private manager: SessionManager | null = null;
  private logger: Pick<Console, 'info' | 'warn'> = console;
  private now: () => number = () => Date.now();
  private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
  private randomTypingMs: () => number = () => TYPING_MIN_MS + Math.random() * Math.max(0, TYPING_MAX_MS - TYPING_MIN_MS);
  private fetchImpl: typeof fetch = fetch;
  private resolveAgentIdImpl?: (session: string) => Promise<string>;
  private makeRecorderImpl?: (agentId: string, chatId: string) => RuntimeRecorder;
  private getModelSettingsImpl?: () => Promise<ModelSettingsSecrets | null>;

  /** Live subscriptions: session -> unsubscribe. */
  private subscriptions = new Map<string, () => void>();
  /** Chats where a human replied recently: chatId -> humanActiveUntil (ms). */
  private humanActiveUntil = new Map<string, number>();
  /** Message ids this runtime sent, so its own echoes are not mistaken for human replies. */
  private botSentIds = new Set<string>();
  /** Per-chat single-flight: an in-flight pipeline swallows rapid follow-ups. */
  private inFlight = new Map<string, boolean>();
  private pending = new Map<string, NormalizedChatMessage>();
  /** Message ids already handled (replays must not re-answer). */
  private handledIds = new Set<string>();

  configure(deps: ChatRuntimeDeps): void {
    this.manager = deps.manager ?? this.manager;
    this.logger = deps.logger ?? this.logger;
    if (deps.now) this.now = deps.now;
    if (deps.sleep) this.sleep = deps.sleep;
    if (deps.randomTypingMs) this.randomTypingMs = deps.randomTypingMs;
    if (deps.fetchImpl) this.fetchImpl = deps.fetchImpl;
    if (deps.resolveAgentId) this.resolveAgentIdImpl = deps.resolveAgentId;
    if (deps.makeRecorder) this.makeRecorderImpl = deps.makeRecorder;
    if (deps.getModelSettings) this.getModelSettingsImpl = deps.getModelSettings;
  }

  /**
   * Subscribe the runtime to every session an agent is bound to. Idempotent;
   * call again after the binding set changes.
   */
  async start(): Promise<void> {
    if (!this.manager) return;
    const agents = await agentService.listAgents();
    const bound = new Map<string, Agent[]>();
    for (const agent of agents) {
      const chat = (agent.settings as Record<string, unknown> | undefined)?.chat as
        | { enabled?: boolean; session?: string }
        | undefined;
      if (!chat?.enabled || typeof chat.session !== 'string' || !chat.session.trim()) continue;
      const session = chat.session.trim();
      bound.set(session, [...(bound.get(session) ?? []), agent]);
    }

    // Subscribe new sessions, drop gone ones.
    for (const session of bound.keys()) {
      if (this.subscriptions.has(session)) continue;
      const unsubscribe = this.subscribeSession(session);
      this.subscriptions.set(session, unsubscribe);
      this.logger.info?.(`chat runtime: listening for inbound messages on session '${session}'`);
    }
    for (const [session, unsubscribe] of this.subscriptions) {
      if (!bound.has(session)) {
        unsubscribe();
        this.subscriptions.delete(session);
        this.logger.info?.(`chat runtime: no agent bound to '${session}', unsubscribed`);
      }
    }
  }

  stop(): void {
    for (const unsubscribe of this.subscriptions.values()) unsubscribe();
    this.subscriptions.clear();
  }

  private subscribeSession(session: string): () => void {
    if (!this.manager) return () => {};
    const stream = this.manager.getSessionEvents(session, [BUNWAEvents.MESSAGE, BUNWAEvents.MESSAGE_ANY]);
    const subscription = stream.subscribe({
      next: (tagged: { event: BUNWAEvents; payload: NormalizedChatMessage }) => {
        void this.onMessage(session, tagged.event, tagged.payload);
      },
      error: (err) => this.logger.warn?.(`chat runtime: '${session}' stream error: ${String(err)}`),
    });
    return () => subscription.unsubscribe();
  }

  private async onMessage(session: string, event: BUNWAEvents, payload: NormalizedChatMessage): Promise<void> {
    if (!payload?.from) return;

    // Outbound: watch for human replies (the bot's own echoes are expected).
    if (payload.fromMe) {
      if (!this.botSentIds.has(payload.id)) {
        this.humanActiveUntil.set(payload.from, this.now() + HUMAN_ACTIVE_HAND_BACK_MINUTES * 60_000);
        this.logger.info?.(`chat runtime: human reply detected in '${payload.from}' — bot pauses for ${HUMAN_ACTIVE_HAND_BACK_MINUTES} min`);
      } else {
        this.botSentIds.delete(payload.id);
      }
      return;
    }

    // Inbound (MESSAGE carries inbound only on both engines).
    if (event !== BUNWAEvents.MESSAGE) return;
    if (this.handledIds.has(payload.id)) return;
    this.handledIds.add(payload.id);
    if (this.handledIds.size > 5000) this.handledIds.clear();

    const chatId = payload.from;
    if (isBroadcast(chatId)) return;
    if (isGroup(chatId)) {
      this.logger.info?.(`chat runtime: skipping group message in '${chatId}' (v1 handles 1:1 chats)`);
      return;
    }
    if (!payload.body?.trim()) return;
    if (payload.hasMedia) {
      this.logger.info?.(`chat runtime: media message in '${chatId}' skipped (v1 handles text)`);
      return;
    }

    if ((this.humanActiveUntil.get(chatId) ?? 0) > this.now()) return;

    // Single-flight per chat: while replying, keep only the newest message.
    if (this.inFlight.get(chatId)) {
      this.pending.set(chatId, payload);
      return;
    }
    await this.answer(session, chatId, payload);
    // Answer any message that arrived mid-reply (coalesced to the latest).
    const next = this.pending.get(chatId);
    if (next) {
      this.pending.delete(chatId);
      await this.answer(session, chatId, next);
    }
  }

  private async answer(session: string, chatId: string, inbound: NormalizedChatMessage): Promise<void> {
    const whatsapp = this.manager?.getSession(session);
    if (!whatsapp) return;
    this.inFlight.set(chatId, true);
    const agentId = this.resolveAgentIdImpl ? await this.resolveAgentIdImpl(session) : await this.boundAgentId(session);
    const recorder = this.makeRecorderImpl
      ? this.makeRecorderImpl(agentId, chatId)
      : new RuntimeRecorder({
          baseUrl: process.env.BUNWA_URL || 'http://127.0.0.1:3001',
          apiKey: process.env.BUNWA_API_KEY || process.env.WAHA_API_KEY || '',
          agentId,
          contact: chatId,
          fetchImpl: this.fetchImpl,
          logger: this.logger,
        });
    const conversationId = await recorder.begin({ kind: 'chat', session });
    // The inbound turn lands before the reply so the conversation history the
    // next turn reads from is in true chronological order.
    await recorder.caller(inbound.body);
    const typingMs = this.randomTypingMs();
    const typingStartedAt = this.now();
    try {
      // 1. Read receipt first: the customer sees the blue ticks at once.
      await this.guarded(() => whatsapp.sendSeen({ chatId, messageId: inbound.id }), 'sendSeen');
      // 2. Typing indicator while the reply is being composed.
      await this.guarded(() => whatsapp.setPresence(BUNWAPresenceStatus.TYPING, chatId), 'typing on');

      // 3. Model call runs inside the typing window; the reply is ready when
      //    both the hold and the completion are done.
      const [reply] = await Promise.all([
        this.composeReply(agentId, conversationId, chatId, inbound),
        this.sleep(typingMs),
      ]);

      // 4. Stop typing, then send — per the spec, in that order.
      await this.guarded(() => whatsapp.setPresence(BUNWAPresenceStatus.PAUSED, chatId), 'typing off');
      if (!reply) {
        await recorder.recordEvent('model.error', { chatId, reason: 'no reply composed' });
        return;
      }
      const sent = await this.guarded(() => whatsapp.sendText({ chatId, text: reply }), 'sendText');
      const sentId = this.extractMessageId(sent);
      if (sentId) this.botSentIds.add(sentId);
      await recorder.reply(reply);
    } catch (error) {
      this.logger.warn?.(`chat runtime: pipeline failed in '${chatId}': ${error instanceof Error ? error.message : String(error)}`);
      await recorder.recordEvent('model.error', { chatId, reason: String(error) });
    } finally {
      const held = this.now() - typingStartedAt;
      this.inFlight.delete(chatId);
      this.logger.info?.(`chat runtime: replied in '${chatId}' after ${(held / 1000).toFixed(1)} s (typing hold ${(typingMs / 1000).toFixed(1)} s)`);
      await recorder.end({ outcome: 'answered' });
    }
  }

  /** Never let a presence/read failure break the reply itself. */
  private async guarded<T>(call: () => Promise<T>, what: string): Promise<T | null> {
    try {
      return await call();
    } catch (error) {
      this.logger.warn?.(`chat runtime: ${what} failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async composeReply(
    agentId: string,
    conversationId: string | null,
    chatId: string,
    inbound: NormalizedChatMessage,
  ): Promise<string | null> {
    if (!agentId) return null;
    const system = await agentService.effectivePrompt(agentId, chatId, inbound.body).catch(() => null);
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (conversationId) {
      try {
        const messages = await agentService.listConversationMessages(conversationId, { limit: HISTORY_TURNS * 2 + 1 });
        for (const message of [...messages].reverse()) {
          if (history.length >= HISTORY_TURNS) break;
          if (!message.text?.trim()) continue;
          history.push({ role: message.role === 'agent' ? 'assistant' : 'user', content: message.text.slice(0, 2000) });
        }
        history.reverse();
      } catch {
        // History is best-effort; the current message alone still works.
      }
    }
    history.push({ role: 'user', content: inbound.body.slice(0, 4000) });

    const settings = this.getModelSettingsImpl
      ? await this.getModelSettingsImpl().catch(() => null)
      : await agentService.getModelSettingsSecrets().catch(() => null);
    if (!settings?.apiKey || !settings.model) {
      this.logger.warn?.('chat runtime: no chat model configured — nothing to send');
      return null;
    }
    const messages = [
      ...(system ? [{ role: 'system' as const, content: system }] : []),
      ...history,
    ];
    const reply = await this.callChatModel(settings, messages);
    if (reply) return reply;
    // Fallback model when the primary fails (same contract as vision).
    if (settings.fallbackApiKey && settings.fallbackModel) {
      return this.callChatModel(
        {
          baseUrl: settings.fallbackBaseUrl,
          apiKey: settings.fallbackApiKey,
          model: settings.fallbackModel,
        },
        messages,
      );
    }
    return null;
  }

  /** OpenAI-compatible /chat/completions call (same pattern as the vision reader). */
  private async callChatModel(
    settings: { baseUrl: string | null; apiKey: string | null; model: string | null },
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  ): Promise<string | null> {
    if (!settings.baseUrl || !settings.apiKey || !settings.model) return null;
    const url = `${settings.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({ model: settings.model, messages, max_tokens: 700, temperature: 0.7 }),
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn?.(`chat runtime: model ${settings.model} -> HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content?.trim();
      return text || null;
    } catch (error) {
      this.logger.warn?.(`chat runtime: model ${settings.model} call failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async boundAgentId(session: string): Promise<string> {
    const agents = await agentService.listAgents();
    for (const agent of agents) {
      const chat = (agent.settings as Record<string, unknown> | undefined)?.chat as
        | { enabled?: boolean; session?: string }
        | undefined;
      if (chat?.enabled && chat.session === session) return agent.id;
    }
    return '';
  }

  /** The engines return different send receipts; accept the common shapes. */
  private extractMessageId(sent: unknown): string | null {
    if (!sent || typeof sent !== 'object') return null;
    const record = sent as Record<string, unknown>;
    const direct = record.id ?? (record as any).to?.id ?? (record as any).key?.id;
    if (typeof direct === 'string') return direct;
    if (typeof direct === 'object' && direct && typeof (direct as Record<string, unknown>).id === 'string') {
      return (direct as Record<string, unknown>).id as string;
    }
    return null;
  }

  /** Test/admin surface: fire the pipeline for a synthetic inbound message. */
  async handleInbound(session: string, message: NormalizedChatMessage): Promise<void> {
    await this.onMessage(session, BUNWAEvents.MESSAGE, message);
  }

  /** Test/admin surface: current human-active state. */
  isHumanActive(chatId: string): boolean {
    return (this.humanActiveUntil.get(chatId) ?? 0) > this.now();
  }
}

export const chatRuntime = new ChatRuntimeService();

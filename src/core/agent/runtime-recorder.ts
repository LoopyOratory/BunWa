/**
 * Runtime recorder — the write side of BunWa's analytics.
 *
 * The call runtimes (scripts/call-live.ts, scripts/fish-bridge.ts) stream
 * audio and transcribe turns, but until this module nothing wrote those turns
 * back to BunWa, so every dashboard surface ran on seed data. The recorder
 * persists what actually happened:
 *
 *   begin()            -> POST /api/agents/:id/conversations
 *   turn(role, text)   -> POST /api/agents/conversations/:id/messages
 *                          + POST /api/agents/events (message.inbound/outbound)
 *   reply(...)         -> turn('agent', ...) + an agent.reply event carrying
 *                          firstResponseMs for the first reply of the call
 *   end(...)           -> POST /api/agents/conversations/:id/close
 *
 * Every write is best-effort: a dashboard that is down must never break a
 * live call, so failures log a warning and the call continues.
 */

export type RecorderRole = 'customer' | 'agent' | 'system' | 'tool';

export interface RuntimeRecorderOptions {
  /** BunWa base URL, e.g. http://127.0.0.1:3001 */
  baseUrl: string;
  /** Platform API key with agent manage rights. */
  apiKey: string;
  /** BUNWA_AGENT_ID: which agent the conversation belongs to. */
  agentId: string;
  /** Caller identity (JID or phone) stored as the conversation's userId. */
  contact?: string;
  logger?: Pick<Console, 'info' | 'warn'>;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

interface TurnContext {
  /** Wall-clock ms at begin(); the first agent reply's latency is measured from it. */
  startedAt: number;
  firstReplyRecorded: boolean;
}

export class RuntimeRecorder {
  private readonly fetchImpl: typeof fetch;
  private readonly logger: Pick<Console, 'info' | 'warn'>;
  private conversationId: string | null = null;
  private readonly turn: TurnContext = { startedAt: 0, firstReplyRecorded: false };

  constructor(private readonly options: RuntimeRecorderOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger ?? console;
  }

  get active(): boolean {
    return Boolean(this.options.agentId && this.options.apiKey && this.conversationId);
  }

  get conversation(): string | null {
    return this.conversationId;
  }

  /** Open a conversation for the configured agent. No-op without agent config. */
  async begin(metadata: Record<string, unknown> = {}): Promise<string | null> {
    if (!this.options.agentId || !this.options.apiKey) return null;
    try {
      const conversation = await this.post<{ conversation: { id: string } }>(
        `/api/agents/${encodeURIComponent(this.options.agentId)}/conversations`,
        {
          userId: this.options.contact ?? null,
          channel: 'voice',
          metadata: { ...metadata, contact: this.options.contact ?? null },
        },
      );
      this.conversationId = conversation.conversation.id;
      this.turn.startedAt = Date.now();
      this.turn.firstReplyRecorded = false;
      this.logger.info?.(`runtime recorder: conversation ${this.conversationId} opened for ${this.options.contact ?? 'unknown caller'}`);
      return this.conversationId;
    } catch (error) {
      this.warn('begin failed', error);
      return null;
    }
  }

  /** Persist something the caller said. */
  async caller(text: string): Promise<void> {
    await this.writeTurn('customer', text, 'message.inbound');
  }

  /**
   * Persist something the agent said. The first reply of the call carries
   * firstResponseMs in its agent.reply event — the KPI the analytics page
   * reports as median response time.
   */
  async reply(text: string, extra: Record<string, unknown> = {}): Promise<void> {
    const firstResponseMs = this.turn.firstReplyRecorded ? undefined : Date.now() - this.turn.startedAt;
    await this.writeTurn('agent', text, 'message.outbound', {
      ...extra,
      ...(firstResponseMs !== undefined ? { firstResponseMs } : {}),
    });
    await this.recordEvent('agent.reply', firstResponseMs !== undefined ? { firstResponseMs, ...extra } : extra);
    this.turn.firstReplyRecorded = true;
  }

  /** Record a raw analytics event on the active conversation. */
  async recordEvent(type: string, metadata: Record<string, unknown> = {}): Promise<void> {
    if (!this.active) return;
    try {
      await this.post(`/api/agents/events`, {
        type,
        agentId: this.options.agentId,
        conversationId: this.conversationId,
        data: metadata,
      });
    } catch (error) {
      this.warn(`event ${type} failed`, error);
    }
  }

  /** Close the conversation (status ended). Safe to call repeatedly. */
  async end(outcome: Record<string, unknown> = {}): Promise<void> {
    if (!this.conversationId) return;
    try {
      await this.post(`/api/agents/conversations/${encodeURIComponent(this.conversationId)}/close`, outcome);
      this.logger.info?.('runtime recorder: conversation closed');
    } catch (error) {
      this.warn('close failed', error);
    } finally {
      this.conversationId = null;
    }
  }

  private async writeTurn(
    role: RecorderRole,
    text: string,
    eventType: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.active || !text.trim()) return;
    try {
      await this.post(`/api/agents/conversations/${encodeURIComponent(this.conversationId!)}/messages`, {
        role,
        text,
        metadata,
      });
      await this.post(`/api/agents/events`, {
        type: eventType,
        agentId: this.options.agentId,
        conversationId: this.conversationId,
        data: metadata,
      });
    } catch (error) {
      this.warn(`turn (${role}) failed`, error);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.options.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 200);
      throw new Error(`POST ${path} -> ${response.status}${detail ? ` ${detail}` : ''}`);
    }
    return (await response.json()) as T;
  }

  private warn(what: string, error: unknown): void {
    this.logger.warn?.(`runtime recorder: ${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

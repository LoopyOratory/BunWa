import { container } from 'tsyringe';
import { SessionManager } from '../manager.core';
import { agentService } from './agent.service';

export interface ScheduleCloseOptions {
  session: string;
  chatId: string;
  /** When the conversation should be closed, measured from now. */
  closesInSeconds: number;
  /** How long before the close to ask for a review. Default 10 seconds. */
  reviewLeadSeconds?: number;
  /** Override the review message. */
  message?: string;
}

interface ScheduledClose {
  reviewTimer: ReturnType<typeof setTimeout> | null;
  closeTimer: ReturnType<typeof setTimeout>;
}

const timers = new Map<string, ScheduledClose>();

function reviewMessage(agentName?: string): string {
  const name = agentName ? ` with ${agentName}` : '';
  return `Thanks for chatting${name}. How would you rate this conversation? Reply with a number from 1 to 5.`;
}

export class ConversationLifecycleService {
  scheduleClose(conversationId: string, options: ScheduleCloseOptions): { reviewAt: string; closeAt: string } {
    this.cancel(conversationId);
    const closesInMs = Math.max(1, options.closesInSeconds) * 1000;
    const leadMs = Math.max(0, options.reviewLeadSeconds ?? 10) * 1000;
    const reviewInMs = Math.max(0, closesInMs - leadMs);
    const now = Date.now();
    const reviewAt = new Date(now + reviewInMs).toISOString();
    const closeAt = new Date(now + closesInMs).toISOString();

    const reviewTimer = setTimeout(() => {
      void this.sendReview(conversationId, options);
    }, reviewInMs);

    const closeTimer = setTimeout(() => {
      void this.close(conversationId);
    }, closesInMs);

    timers.set(conversationId, { reviewTimer, closeTimer });
    return { reviewAt, closeAt };
  }

  cancel(conversationId: string): void {
    const existing = timers.get(conversationId);
    if (!existing) return;
    if (existing.reviewTimer) clearTimeout(existing.reviewTimer);
    clearTimeout(existing.closeTimer);
    timers.delete(conversationId);
  }

  private async sendReview(conversationId: string, options: ScheduleCloseOptions): Promise<void> {
    try {
      const conversation = await agentService.getConversation(conversationId);
      if (!conversation || !conversation.reviewEnabled) return;
      const agent = await agentService.getAgent(conversation.agentId);
      const text = options.message || reviewMessage(agent?.name);
      const manager = container.resolve(SessionManager);
      const session = manager.getSession(options.session) as any;
      if (!session || typeof session.sendText !== 'function') {
        throw new Error(`Session ${options.session} is not running`);
      }
      await session.sendText({ chatId: options.chatId, text });
      await agentService.setReviewRequested(conversationId);
      await agentService.recordEvent({
        type: 'review.requested',
        agentId: conversation.agentId,
        conversationId,
        userId: conversation.userId,
        data: { session: options.session, chatId: options.chatId },
      });
    } catch (error) {
      await agentService.recordEvent({
        type: 'review.request_failed',
        conversationId,
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  private async close(conversationId: string): Promise<void> {
    timers.delete(conversationId);
    try {
      const conversation = await agentService.closeConversation(conversationId);
      if (!conversation) return;
      await agentService.recordEvent({
        type: 'conversation.closed',
        agentId: conversation.agentId,
        conversationId,
        userId: conversation.userId,
      });
    } catch {
      // The timer is best-effort; the API remains the source of truth.
    }
  }
}

export const conversationLifecycle = new ConversationLifecycleService();

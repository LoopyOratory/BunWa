/**
 * Bulk Message Service — send messages to multiple recipients with delay randomization.
 * Simplified from OpenWA's bulk-message.service.ts (no TypeORM, no NestJS).
 */

import { randomUUID } from 'crypto';
import pino from 'pino';
import { safeFetch } from '../common/security/ssrf-guard';

export enum BatchStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface BulkMessageRecipient {
  chatId: string;
  variables?: Record<string, string>;
}

export interface BulkMessageContent {
  text?: string;
  caption?: string;
  image?: { base64?: string; url?: string; mimetype?: string };
  video?: { base64?: string; url?: string; mimetype?: string };
  audio?: { base64?: string; url?: string; mimetype?: string };
  document?: { base64?: string; url?: string; mimetype?: string; filename?: string };
}

export interface BulkMessageBatch {
  id: string;
  sessionId: string;
  status: BatchStatus;
  content: BulkMessageContent;
  recipients: BulkMessageRecipient[];
  template?: string;
  delayMs?: number;
  randomizeDelay?: boolean;
  stopOnError?: boolean;
  currentIndex: number;
  sent: number;
  failed: number;
  createdAt: Date;
  updatedAt: Date;
  cancelled: boolean;
  results: Array<{ chatId: string; status: 'sent' | 'failed'; error?: string }>;
}

/** Render template variables: {{name}} -> value */
function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Turn a bulk content media field into raw bytes. Accepts a bare base64 string
 * (or data URL), or an http(s) URL fetched through the SSRF guard. Returns
 * undefined when the field carries no bytes.
 */
async function materializeMedia(media?: { base64?: string; url?: string }): Promise<Buffer | undefined> {
  if (!media) return undefined;
  if (media.base64) {
    const base64 = media.base64.includes(',') ? media.base64.split(',')[1] : media.base64;
    return Buffer.from(base64, 'base64');
  }
  if (media.url) {
    const res: any = await safeFetch(media.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch bulk media from ${media.url} (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return undefined;
}

export class BulkMessageService {
  private batches = new Map<string, BulkMessageBatch>();
  private processing = new Map<string, boolean>();
  private logger = pino({ name: 'BulkMessageService' });

  constructor(
    private sendText: (chatId: string, text: string) => Promise<string>,
    private sendImage?: (chatId: string, buffer: Buffer, caption?: string) => Promise<string>,
    private sendVideo?: (chatId: string, buffer: Buffer, caption?: string) => Promise<string>,
    private sendAudio?: (chatId: string, buffer: Buffer) => Promise<string>,
    private sendDocument?: (chatId: string, buffer: Buffer, filename?: string, mimetype?: string) => Promise<string>,
  ) {}

  /** Create a new batch */
  createBatch(
    sessionId: string,
    recipients: BulkMessageRecipient[],
    content: BulkMessageContent,
    options: { delayMs?: number; randomizeDelay?: boolean; stopOnError?: boolean; template?: string } = {},
  ): BulkMessageBatch {
    const batch: BulkMessageBatch = {
      id: randomUUID(),
      sessionId,
      status: BatchStatus.PENDING,
      content,
      recipients,
      template: options.template,
      delayMs: options.delayMs ?? 1000,
      randomizeDelay: options.randomizeDelay ?? true,
      stopOnError: options.stopOnError ?? false,
      currentIndex: 0,
      sent: 0,
      failed: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      cancelled: false,
      results: [],
    };
    this.batches.set(batch.id, batch);
    return batch;
  }

  /** Start processing a batch */
  async processBatch(batchId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`Batch not found: ${batchId}`);
    if (batch.status === BatchStatus.PROCESSING) return;

    batch.status = BatchStatus.PROCESSING;
    this.processing.set(batchId, true);

    for (let i = batch.currentIndex; i < batch.recipients.length; i++) {
      if (batch.cancelled) {
        batch.status = BatchStatus.CANCELLED;
        break;
      }

      const recipient = batch.recipients[i];
      try {
        const content = batch.content;
        const image = await materializeMedia(content.image);
        const video = image ? undefined : await materializeMedia(content.video);
        const audio = image || video ? undefined : await materializeMedia(content.audio);
        const document = image || video || audio ? undefined : await materializeMedia(content.document);

        if (image) {
          if (!this.sendImage) throw new Error('Image content is not supported by this bulk sender');
          await this.sendImage(recipient.chatId, image, content.caption);
        } else if (video) {
          if (!this.sendVideo) throw new Error('Video content is not supported by this bulk sender');
          await this.sendVideo(recipient.chatId, video, content.caption);
        } else if (audio) {
          if (!this.sendAudio) throw new Error('Audio content is not supported by this bulk sender');
          await this.sendAudio(recipient.chatId, audio);
        } else if (document) {
          if (!this.sendDocument) throw new Error('Document content is not supported by this bulk sender');
          await this.sendDocument(recipient.chatId, document, content.document?.filename, content.document?.mimetype);
        } else {
          let text = content.text || '';

          // Template variable substitution
          if (batch.template && recipient.variables) {
            text = renderTemplate(batch.template, recipient.variables);
          }

          if (text) {
            await this.sendText(recipient.chatId, text);
          }
        }

        batch.sent++;
        batch.currentIndex = i + 1;
        batch.results.push({ chatId: recipient.chatId, status: 'sent' });
      } catch (error: any) {
        batch.failed++;
        batch.results.push({ chatId: recipient.chatId, status: 'failed', error: error.message });
        if (batch.stopOnError) {
          batch.status = BatchStatus.FAILED;
          break;
        }
      }

      batch.updatedAt = new Date();

      // Delay between messages
      if (i < batch.recipients.length - 1) {
        const delay = batch.randomizeDelay
          ? batch.delayMs! + Math.random() * batch.delayMs! * 0.5
          : batch.delayMs!;
        await Bun.sleep(delay);
      }
    }

    if (batch.status === BatchStatus.PROCESSING) {
      batch.status = batch.failed > 0 && batch.sent === 0 ? BatchStatus.FAILED : BatchStatus.COMPLETED;
    }

    this.processing.delete(batchId);
  }

  /** Cancel a batch */
  cancelBatch(batchId: string): boolean {
    const batch = this.batches.get(batchId);
    if (!batch) return false;
    batch.cancelled = true;
    return true;
  }

  /** Get batch status */
  getBatch(batchId: string): BulkMessageBatch | undefined {
    return this.batches.get(batchId);
  }

  /** Get all batches */
  listBatches(sessionId?: string): BulkMessageBatch[] {
    return Array.from(this.batches.values())
      .filter(b => !sessionId || b.sessionId === sessionId);
  }
}

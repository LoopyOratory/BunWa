import { injectable, inject } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import pino from 'pino';

interface WebhookPayload {
  event: string;
  session: string;
  timestamp: number;
  data: any;
}

@injectable()
export class WebhookDelivery {
  private logger: any;

  constructor(
    @inject(WhatsappConfigService) private config: WhatsappConfigService,
  ) {
    this.logger = pino({ name: 'WebhookDelivery' });
  }

  /**
   * Send an event to the configured webhook URL using Bun.fetch().
   * Retries up to 3 times with exponential backoff on network/5xx errors.
   * Non-blocking — failures are logged but don't throw.
   */
  async deliver(payload: WebhookPayload): Promise<void> {
    const webhookUrl = this.config.getWebhookUrl();
    if (!webhookUrl) return;

    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WAHA-Event': payload.event,
            'X-WAHA-Session': payload.session,
            'X-WAHA-Timestamp': String(payload.timestamp),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          this.logger.debug(`Webhook delivered: ${payload.event} for ${payload.session}`);
          return;
        }

        // Retry on 5xx errors
        if (res.status >= 500 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100 + Math.random() * 100;
          await Bun.sleep(delay);
          continue;
        }

        this.logger.error(
          `Webhook delivery failed: ${payload.event} for ${payload.session} — HTTP ${res.status}`,
        );
        return;
      } catch (error: any) {
        // Retry on network errors
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100 + Math.random() * 100;
          await Bun.sleep(delay);
          continue;
        }
        this.logger.error(
          `Webhook delivery failed: ${payload.event} for ${payload.session} — ${error.message}`,
        );
        return;
      }
    }
  }
}

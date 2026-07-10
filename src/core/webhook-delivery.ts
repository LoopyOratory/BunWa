/**
 * Webhook Delivery — overhauled with SSRF protection, HMAC signing, filters, idempotency.
 * Ported features from OpenWA + improved retry logic.
 */

import { injectable, inject, container } from 'tsyringe';
import { WhatsappConfigService } from '../config.service';
import { resolveAndPinFetch, isSsrfProtectionEnabled, resolveSafeFetchTarget, SsrfBlockedError } from '../common/security/ssrf-guard';
import { generateWebhookSignature, generateIdempotencyKey } from '../common/security/webhook-signing';
import { evaluateFilters, type WebhookFilters, type LidResolver } from '../common/security/webhook-filters';
import { AuditService, AuditAction } from './audit/audit.service';
import pino from 'pino';
import { randomBytes } from 'crypto';

export interface DeliveryResult {
  ok: boolean;
  statusCode?: number;
  error?: string;
}

interface WebhookPayload {
  event: string;
  session: string;
  timestamp: number;
  data: any;
}

interface WebhookConfig {
  url: string;
  method?: string;
  secret?: string;
  retries?: number;
  retryDelayMs?: number;
  customHeaders?: Record<string, string>;
  filters?: WebhookFilters;
}

@injectable()
export class WebhookDelivery {
  private logger: pino.Logger;

  constructor(
    @inject(WhatsappConfigService) private config: WhatsappConfigService,
  ) {
    this.logger = pino({ name: 'WebhookDelivery' });
  }

  /**
   * Send an event to the configured webhook URL.
   * Features: SSRF protection, HMAC signing, idempotency keys, filters, custom headers, retry.
   */
  async deliver(
    payload: WebhookPayload,
    webhookConfig?: WebhookConfig,
    resolveLid?: LidResolver,
  ): Promise<DeliveryResult> {
    const url = webhookConfig?.url || this.config.getWebhookUrl();
    if (!url) return { ok: false, error: 'No webhook URL configured' };

    // Apply webhook filters — skip if filters don't match
    if (webhookConfig?.filters) {
      if (!evaluateFilters(webhookConfig.filters, payload.event, payload.data, resolveLid)) {
        this.logger.debug(`Webhook filtered out: ${payload.event} for ${payload.session}`);
        return { ok: true };
      }
    }

    const maxRetries = webhookConfig?.retries ?? 3;
    const retryDelayMs = webhookConfig?.retryDelayMs ?? 100;
    const deliveryId = randomBytes(16).toString('hex');
    const idempotencyKey = generateIdempotencyKey(payload.event, payload.session, payload.data);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const bodyStr = JSON.stringify(payload);

        // SSRF protection
        if (isSsrfProtectionEnabled()) {
          await resolveSafeFetchTarget(url);
        }

        // Build headers
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-WAHA-Event': payload.event,
          'X-WAHA-Session': payload.session,
          'X-WAHA-Timestamp': String(payload.timestamp),
          'X-WAHA-Delivery-Id': deliveryId,
          'X-WAHA-Idempotency-Key': idempotencyKey,
          'X-WAHA-Retry-Count': String(attempt),
        };

        // HMAC signing
        if (webhookConfig?.secret) {
          headers['X-WAHA-Signature'] = generateWebhookSignature(bodyStr, webhookConfig.secret);
        }

        // Custom headers (system headers take precedence)
        if (webhookConfig?.customHeaders) {
          for (const [key, value] of Object.entries(webhookConfig.customHeaders)) {
            if (!key.startsWith('X-WAHA-') && key !== 'Content-Type') {
              headers[key] = value;
            }
          }
        }

        const httpMethod = (webhookConfig?.method || 'POST').toUpperCase();
        const isGet = httpMethod === 'GET';
        const fetchUrl = isGet ? `${url}?payload=${encodeURIComponent(bodyStr)}` : url;

        const res = await resolveAndPinFetch(fetchUrl, {
          method: httpMethod,
          headers: isGet ? {} : headers,
          body: isGet ? undefined : bodyStr,
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          this.logger.debug(`Webhook delivered: ${payload.event} for ${payload.session} (${deliveryId})`);
          container.resolve(AuditService).logInfo(AuditAction.WEBHOOK_TRIGGERED, {
            sessionName: payload.session,
            statusCode: res.status,
            metadata: { event: payload.event, deliveryId },
          });
          return { ok: true, statusCode: res.status };
        }

        if (res.status >= 500 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * retryDelayMs + Math.random() * 100;
          await Bun.sleep(delay);
          continue;
        }

        this.logger.error(`Webhook delivery failed: ${payload.event} for ${payload.session} — HTTP ${res.status}`);
        container.resolve(AuditService).logWarn(AuditAction.WEBHOOK_FAILED, {
          sessionName: payload.session,
          statusCode: res.status,
          errorMessage: `HTTP ${res.status}`,
          metadata: { event: payload.event, deliveryId },
        });
        return { ok: false, statusCode: res.status, error: `HTTP ${res.status}` };
      } catch (error: any) {
        if (error instanceof SsrfBlockedError) {
          this.logger.error(`Webhook SSRF blocked: ${error.message}`);
          container.resolve(AuditService).logWarn(AuditAction.WEBHOOK_FAILED, {
            sessionName: payload.session,
            errorMessage: error.message,
            metadata: { event: payload.event, deliveryId, reason: 'ssrf_blocked' },
          });
          return { ok: false, error: error.message };
        }
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * retryDelayMs + Math.random() * 100;
          await Bun.sleep(delay);
          continue;
        }
        this.logger.error(`Webhook delivery failed: ${payload.event} for ${payload.session} — ${error.message}`);
        container.resolve(AuditService).logWarn(AuditAction.WEBHOOK_FAILED, {
          sessionName: payload.session,
          errorMessage: error.message,
          metadata: { event: payload.event, deliveryId },
        });
        return { ok: false, error: error.message };
      }
    }
    return { ok: false, error: 'Max retries exhausted' };
  }
}

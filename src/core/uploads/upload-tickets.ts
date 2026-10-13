/**
 * Single-use upload tickets.
 *
 * A ticket lets whoever holds its URL upload one file into one session's
 * upload store without the API key — what an MCP agent needs, since it can
 * run `curl` but must never see the key. Only the token's hash is kept, the
 * ticket is spent before the body is read, and it expires in minutes. Kept
 * in memory: a restart cancels open tickets, which is fine at this lifetime.
 */
import { container } from 'tsyringe';
import { WhatsappConfigService } from '../../config.service';
import { assertSafeSegment } from './upload-store';
import { uploadMaxBytes, uploadTicketTtlSeconds } from './upload-config';

export interface UploadTicket {
  session: string;
  maxBytes: number;
  filename?: string;
  expiresAt: number;
  used: boolean;
}

function hashToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}

export class UploadTicketService {
  private readonly tickets = new Map<string, UploadTicket>();

  create(session: string, opts: { filename?: string; maxBytes?: number } = {}) {
    assertSafeSegment(session, 'session');
    this.prune();
    const limit = uploadMaxBytes();
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const ticket: UploadTicket = {
      session,
      maxBytes: opts.maxBytes && opts.maxBytes > 0 ? Math.min(opts.maxBytes, limit) : limit,
      filename: opts.filename?.trim() || undefined,
      expiresAt: Date.now() + uploadTicketTtlSeconds() * 1000,
      used: false,
    };
    this.tickets.set(hashToken(token), ticket);
    return { token, ticket };
  }

  consume(token: string): UploadTicket | null {
    const key = hashToken(token);
    const ticket = this.tickets.get(key);
    if (!ticket || ticket.used || ticket.expiresAt <= Date.now()) {
      if (ticket) this.tickets.delete(key);
      return null;
    }
    ticket.used = true;
    this.tickets.delete(key);
    return ticket;
  }

  prune(now: number = Date.now()): void {
    for (const [key, ticket] of this.tickets) {
      if (ticket.used || ticket.expiresAt <= now) this.tickets.delete(key);
    }
  }
}

export const uploadTickets = new UploadTicketService();

/** Public base for ticket URLs: WAHA_BASE_URL, else the caller's origin, else the configured host. */
export function uploadBaseUrl(requestOrigin?: string): string {
  if (process.env.WAHA_BASE_URL) return process.env.WAHA_BASE_URL.replace(/\/$/, '');
  if (requestOrigin) return requestOrigin.replace(/\/$/, '');
  return container.resolve(WhatsappConfigService).baseUrl;
}

export function ticketResponse(baseUrl: string, token: string, ticket: UploadTicket) {
  const base = baseUrl.replace(/\/$/, '');
  const query = ticket.filename ? `?filename=${encodeURIComponent(ticket.filename)}` : '';
  const uploadUrl = `${base}/uploads/${token}${query}`;
  return {
    uploadUrl,
    expiresAt: new Date(ticket.expiresAt).toISOString(),
    maxBytes: ticket.maxBytes,
    curl: `curl -sS -T <FILE> '${uploadUrl}'`,
  };
}

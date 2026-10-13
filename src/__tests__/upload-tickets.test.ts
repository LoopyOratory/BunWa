import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { UploadTicketService, ticketResponse } from '../core/uploads/upload-tickets';
import { UnprocessableEntityException } from '../core/exceptions';

describe('UploadTicketService', () => {
  it('issues a token that works exactly once', () => {
    const svc = new UploadTicketService();
    const { token, ticket } = svc.create('vivita', { filename: 'ads.zip' });
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(ticket.filename).toBe('ads.zip');
    expect(svc.consume(token)?.session).toBe('vivita');
    expect(svc.consume(token)).toBeNull();
  });

  it('refuses an unknown or expired token', () => {
    const svc = new UploadTicketService();
    expect(svc.consume('nope')).toBeNull();
    const { token, ticket } = svc.create('vivita');
    ticket.expiresAt = Date.now() - 1;
    expect(svc.consume(token)).toBeNull();
  });

  it('caps maxBytes at the server limit', () => {
    process.env.UPLOAD_MAX_BYTES = '1000';
    const svc = new UploadTicketService();
    expect(svc.create('vivita', { maxBytes: 5000 }).ticket.maxBytes).toBe(1000);
    expect(svc.create('vivita', { maxBytes: 10 }).ticket.maxBytes).toBe(10);
    delete process.env.UPLOAD_MAX_BYTES;
  });

  it('validates the session name', () => {
    expect(() => new UploadTicketService().create('../x')).toThrow(UnprocessableEntityException);
  });

  it('builds the upload URL and a ready curl command', () => {
    const svc = new UploadTicketService();
    const { token, ticket } = svc.create('vivita', { filename: 'ads 1.zip' });
    const res = ticketResponse('https://wa.example.com/', token, ticket);
    expect(res.uploadUrl).toBe(`https://wa.example.com/uploads/${token}?filename=ads%201.zip`);
    expect(res.curl).toBe(`curl -sS -T <FILE> '${res.uploadUrl}'`);
    expect(res.maxBytes).toBe(ticket.maxBytes);
  });
});

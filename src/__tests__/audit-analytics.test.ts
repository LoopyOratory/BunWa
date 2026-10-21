import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuditAction, AuditService } from '../core/audit/audit.service';

/** The analytics and error-report queries behind GET /api/dashboard/{analytics,errors}. */
describe('audit analytics', () => {
  let dir: string;
  let audit: AuditService;
  const window = () => ({ from: new Date(Date.now() - 3_600_000), to: new Date(Date.now() + 1_000), bucketMs: 300_000 });

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'bunwa-analytics-'));
    audit = new AuditService(dir);
    await audit.logInfo(AuditAction.MESSAGE_SENT, { sessionName: 'shop', metadata: { action: 'sendText' } });
    await audit.logInfo(AuditAction.MESSAGE_SENT, { sessionName: 'shop', metadata: { action: 'sendText' } });
    await audit.logWarn(AuditAction.MESSAGE_FAILED, {
      sessionName: 'shop',
      errorMessage: 'Per minute send cap reached',
      metadata: { action: 'sendText', reason: 'policy' },
    });
    await audit.logWarn(AuditAction.MESSAGE_FAILED, {
      sessionName: 'support',
      errorMessage: 'Session not connected',
      metadata: { action: 'sendImage' },
    });
    await audit.logInfo(AuditAction.MCP_TOOL_CALLED, {
      sessionName: 'shop',
      metadata: { tool: 'MessageSendPoll', category: 'message', source: 'mcp' },
    });
    await audit.logWarn(AuditAction.MCP_TOOL_FAILED, {
      sessionName: 'shop',
      errorMessage: 'boom',
      metadata: { tool: 'GroupCreate', category: 'group', source: 'mcp' },
    });
    await audit.logWarn(AuditAction.WEBHOOK_FAILED, {
      sessionName: 'shop',
      errorMessage: 'HTTP 500',
      metadata: { url: 'https://hooks.example/x', event: 'message' },
    });
    await audit.logInfo(AuditAction.SESSION_CONNECTED, { sessionName: 'support' });
    await audit.logWarn(AuditAction.SESSION_DISCONNECTED, { sessionName: 'support' });
    await audit.logWarn(AuditAction.API_KEY_AUTH_FAILED, { path: '/api/sendText' });
    // Not an error: a plain stop
    await audit.logInfo(AuditAction.SESSION_STOPPED, { sessionName: 'support' });
  });

  afterAll(() => {
    audit.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('breaks sends down by feature and channel, with refusals', () => {
    const result = audit.analytics(window());
    const text = result.features.find((f) => f.feature === 'sendText' && f.channel === 'api');
    expect(text).toEqual({ feature: 'sendText', channel: 'api', sent: 2, failed: 1, refused: 1 });
    expect(result.features.find((f) => f.feature === 'MessageSendPoll')).toMatchObject({ channel: 'mcp', sent: 1 });
    // A non-message MCP tool is not a send
    expect(result.features.find((f) => f.feature === 'GroupCreate')).toBeUndefined();
    expect(result.refusedSeries.reduce((a, b) => a + b, 0)).toBe(1);
    expect(result.byHour.sent.reduce((a, b) => a + b, 0)).toBe(3);
    expect(result.byHour.failed.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('reports session stability, MCP and auth activity', () => {
    const result = audit.analytics(window());
    expect(result.stability.find((s) => s.session === 'support')).toMatchObject({ connected: 1, disconnected: 1, stopped: 1, errors: 0 });
    expect(result.mcp).toMatchObject({ calls: 2, failed: 1 });
    expect(result.auth.failed).toBe(1);
  });

  it('honours the session filter', () => {
    const result = audit.analytics({ ...window(), session: 'support' });
    expect(result.features).toEqual([{ feature: 'sendImage', channel: 'api', sent: 0, failed: 1, refused: 0 }]);
  });

  it('lists errors by kind, newest first, with search and paging', () => {
    const all = audit.errors(window());
    expect(all.byKind).toEqual({ send: 1, refused: 1, webhook: 1, mcp: 1, session: 1, auth: 1 });
    expect(all.total).toBe(6);
    expect(all.rows.map((r) => r.kind)).not.toContain(undefined);

    const webhooks = audit.errors({ ...window(), kind: 'webhook' });
    expect(webhooks.total).toBe(1);
    expect(webhooks.rows[0]).toMatchObject({ session: 'shop', errorMessage: 'HTTP 500' });
    expect(webhooks.rows[0].metadata?.url).toBe('https://hooks.example/x');

    expect(audit.errors({ ...window(), search: 'NOT CONNECTED' }).rows[0].session).toBe('support');
    expect(audit.errors({ ...window(), session: 'support' }).total).toBe(2);
    const page = audit.errors({ ...window(), limit: 2, offset: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(6);
  });
});

import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuditAction, AuditService, type AuditSummary } from '../core/audit/audit.service';
import { failureReasonLabel, sendFailureMetadata } from '../core/audit/failure-reason';
import { TooManyRequestsException } from '../core/exceptions';
import { webhookUrlLabel } from '../core/webhook-delivery';
import {
  buildDashboardSummary,
  parseDashboardRange,
  type DashboardSessionInput,
} from '../core/dashboard/dashboard-summary';
import { createDashboardRouter } from '../api/dashboard.routes';
import { SessionManager } from '../core/manager.core';
import { WhatsappConfigService } from '../config.service';

// The dashboard used to download the last 500 audit rows and count them in
// the browser, which went wrong exactly when the server was busy. It now asks
// one endpoint that counts in SQL and decides what needs attention.

const auditDir = () => new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-summary-audit-')));

describe('AuditService.summarize', () => {
  it('counts sends, failures, policy refusals and webhooks per session and in total', async () => {
    const audit = auditDir();
    await audit.logInfo(AuditAction.MESSAGE_SENT, { sessionName: 'alpha' });
    await audit.logInfo(AuditAction.MESSAGE_SENT, { sessionName: 'alpha' });
    await audit.logWarn(AuditAction.MESSAGE_FAILED, { sessionName: 'alpha', errorMessage: 'boom' });
    await audit.logWarn(AuditAction.MESSAGE_FAILED, {
      sessionName: 'alpha',
      errorMessage: 'Send blocked by the sending policy: Quiet hours are in effect (22:00-07:00). Retry after 5 seconds',
      metadata: { reason: 'policy', policyReason: 'Quiet hours are in effect (22:00-07:00)' },
    });
    await audit.logInfo(AuditAction.MCP_TOOL_CALLED, { sessionName: 'beta', metadata: { category: 'message' } });
    await audit.logInfo(AuditAction.MCP_TOOL_CALLED, { sessionName: 'beta', metadata: { category: 'group' } });
    await audit.logInfo(AuditAction.WEBHOOK_TRIGGERED, { sessionName: 'beta', metadata: { url: 'https://hook.example/a' } });
    await audit.logWarn(AuditAction.WEBHOOK_FAILED, { sessionName: 'beta', errorMessage: 'HTTP 502', metadata: { url: 'https://hook.example/a' } });
    await audit.logWarn(AuditAction.WEBHOOK_FAILED, { sessionName: 'beta', errorMessage: 'HTTP 503', metadata: { url: 'https://hook.example/a' } });

    const now = Date.now();
    const summary = audit.summarize({ from: new Date(now - 3_600_000), to: new Date(now + 60_000), bucketMs: 300_000 });

    expect(summary.perSession.alpha).toEqual({ sent: 2, failed: 2, refused: 1, webhookDelivered: 0, webhookFailed: 0 });
    // Only MCP tools in the message category count as sends.
    expect(summary.perSession.beta).toEqual({ sent: 1, failed: 0, refused: 0, webhookDelivered: 1, webhookFailed: 2 });
    expect(summary.totals.sent).toBe(3);
    expect(summary.series.sent.reduce((a, b) => a + b, 0)).toBe(3);
    expect(summary.series.failed.reduce((a, b) => a + b, 0)).toBe(2);
    expect(summary.webhookFailures).toEqual([
      expect.objectContaining({ session: 'beta', url: 'https://hook.example/a', count: 2 }),
    ]);
    expect(summary.failures.reduce((n, row) => n + row.count, 0)).toBe(2);
  });

  it('filters by session and ignores rows outside the range', async () => {
    const audit = auditDir();
    await audit.logInfo(AuditAction.MESSAGE_SENT, { sessionName: 'alpha' });
    await audit.logInfo(AuditAction.MESSAGE_SENT, { sessionName: 'beta' });
    const now = Date.now();
    const onlyAlpha = audit.summarize({ from: new Date(now - 60_000), to: new Date(now + 60_000), bucketMs: 60_000, session: 'alpha' });
    expect(onlyAlpha.totals.sent).toBe(1);
    const past = audit.summarize({ from: new Date(now - 7_200_000), to: new Date(now - 3_600_000), bucketMs: 60_000 });
    expect(past.totals.sent).toBe(0);
  });
});

describe('failure reasons', () => {
  it('marks policy refusals with the rule that fired', () => {
    expect(sendFailureMetadata(new TooManyRequestsException(1000, 'Per day send cap reached'))).toEqual({
      reason: 'policy',
      policyReason: 'Per day send cap reached',
    });
    expect(sendFailureMetadata(new Error('other'))).toEqual({});
    expect(failureReasonLabel('x', { reason: 'policy', policyReason: 'Reachout timelock: wait 30s between new chats' })).toBe(
      'Policy: reachout timelock',
    );
  });

  it('folds ids and numbers so the same error groups together', () => {
    const a = failureReasonLabel('Chat 15551234567@c.us not found after 30 s', null);
    const b = failureReasonLabel('Chat 15559876543@c.us not found after 12 s', null);
    expect(a).toBe(b);
  });

  it('keeps digits inside names and HTTP status codes', () => {
    expect(failureReasonLabel('Session shop-2 is not connected', null)).toBe('Session shop-2 is not connected');
    expect(failureReasonLabel('HTTP 502 after 3 attempts', null)).toBe('HTTP 502 after N attempts');
  });
});

describe('webhookUrlLabel', () => {
  it('keeps origin and path, drops credentials and query', () => {
    expect(webhookUrlLabel('https://user:secret@hook.example/wa?token=abc#x')).toBe('https://hook.example/wa');
    expect(webhookUrlLabel('not a url')).toBe('invalid URL');
  });
});

const emptyAudit = (): AuditSummary => ({
  perSession: {},
  totals: { sent: 0, failed: 0, refused: 0, webhookDelivered: 0, webhookFailed: 0 },
  series: { bucketStart: [], sent: [], failed: [], webhookDelivered: [], webhookFailed: [] },
  failures: [],
  webhookFailures: [],
});

function usage(day: number, dayCap: number) {
  return {
    counts: { lastMinute: 0, lastHour: 0, lastDay: day, newChatsLastDay: 0 },
    effective: {
      maxPerMinute: 10, maxPerHour: 100, maxPerDay: dayCap, newChatsPerDay: 20,
      reachoutMinIntervalSeconds: 60, warmupDays: 14, warmupFloorPercent: 20, quietHours: '', enabled: true,
    },
    warmup: { firstSeenAt: null, ageDays: 20, factor: 1 },
    nextAllowedAt: { minuteCap: null, hourCap: null, dayCap: null, newChatsPerDay: null, reachout: null, quietHours: null },
  };
}

function session(overrides: Partial<DashboardSessionInput>): DashboardSessionInput {
  return {
    name: 's',
    engine: 'NOWEB',
    status: 'WORKING',
    statusSince: null,
    lastActivityAt: null,
    account: null,
    autoStart: false,
    usage: usage(0, 200),
    bypassed: false,
    ...overrides,
  };
}

const server = {
  version: '2026.10.0', tier: 'PLUS', engine: 'NOWEB', uptimeSeconds: 10,
  store: { driver: 'sqlite' as const, ok: true, checkedAt: '' },
};

describe('buildDashboardSummary attention list', () => {
  const now = 1_800_000_000_000;

  it('is empty when everything is healthy', () => {
    const summary = buildDashboardSummary({ now, range: '24h', server, sessions: [session({})], audit: emptyAudit(), recent: emptyAudit() });
    expect(summary.attention).toEqual([]);
    expect(summary.sessions[0].limits?.nearest?.label).toBeDefined();
  });

  it('flags QR, failed and stuck sessions, errors first', () => {
    const summary = buildDashboardSummary({
      now,
      range: '24h',
      server,
      sessions: [
        session({ name: 'slow', status: 'STARTING', statusSince: now - 5 * 60_000 }),
        session({ name: 'qr', status: 'SCAN_QR_CODE', statusSince: now - 12 * 60_000 }),
        session({ name: 'dead', status: 'FAILED' }),
        session({ name: 'fresh', status: 'STARTING', statusSince: now - 30_000 }),
        session({ name: 'off', status: 'STOPPED' }),
      ],
      audit: emptyAudit(),
      recent: emptyAudit(),
    });
    expect(summary.attention.map((item) => [item.severity, item.action, item.session])).toEqual([
      ['error', 'qr', 'qr'],
      ['error', 'restart', 'dead'],
      ['warning', 'restart', 'slow'],
    ]);
    expect(summary.attention[0].detail).toContain('12 min ago');
  });

  it('warns at 80% of a cap and errors when the cap is reached', () => {
    const summary = buildDashboardSummary({
      now,
      range: '24h',
      server,
      sessions: [session({ name: 'near', usage: usage(184, 200) }), session({ name: 'full', usage: usage(200, 200) })],
      audit: emptyAudit(),
      recent: emptyAudit(),
    });
    const byName = Object.fromEntries(summary.attention.map((item) => [item.session, item]));
    expect(byName.near.severity).toBe('warning');
    expect(byName.near.title).toBe('near is at 92% of its daily cap');
    expect(byName.full.severity).toBe('error');
  });

  it('ignores limits for a bypassed session', () => {
    const summary = buildDashboardSummary({
      now, range: '24h', server,
      sessions: [session({ name: 'vip', usage: usage(200, 200), bypassed: true })],
      audit: emptyAudit(), recent: emptyAudit(),
    });
    expect(summary.attention).toEqual([]);
    expect(summary.sessions[0].limits?.enabled).toBe(false);
  });

  it('reports failing webhooks and policy refusals from the last hour', () => {
    const recent = emptyAudit();
    recent.webhookFailures = [{ session: 'a', url: 'https://hook.example/wa', count: 14, lastAt: '', lastError: 'HTTP 502' }];
    recent.perSession = { a: { sent: 1, failed: 6, refused: 6, webhookDelivered: 0, webhookFailed: 14 } };
    const summary = buildDashboardSummary({ now, range: '24h', server, sessions: [session({ name: 'a' })], audit: emptyAudit(), recent });
    expect(summary.attention.map((item) => [item.kind, item.severity])).toEqual([
      ['webhook', 'error'],
      ['sends', 'warning'],
    ]);
    expect(summary.attention[0].detail).toContain('HTTP 502');
  });

  it('groups failure reasons by label', () => {
    const audit = emptyAudit();
    audit.failures = [
      { errorMessage: 'a', metadata: { reason: 'policy', policyReason: 'Quiet hours are in effect (22:00-07:00)' }, count: 4, lastAt: '2026-01-01', session: 'x' },
      { errorMessage: 'b', metadata: { reason: 'policy', policyReason: 'Quiet hours are in effect (23:00-06:00)' }, count: 2, lastAt: '2026-01-02', session: 'y' },
      { errorMessage: 'Session not connected', metadata: null, count: 1, lastAt: '2026-01-03', session: 'x' },
    ];
    const summary = buildDashboardSummary({ now, range: '24h', server, sessions: [], audit, recent: emptyAudit() });
    expect(summary.failureReasons[0]).toMatchObject({ reason: 'Policy: quiet hours', count: 6, session: 'y' });
  });

  it('defaults to 24h for an unknown range', () => {
    expect(parseDashboardRange('7d')).toBe('7d');
    expect(parseDashboardRange('nope')).toBe('24h');
    expect(parseDashboardRange(undefined)).toBe('24h');
  });
});

describe('GET /api/dashboard/summary', () => {
  let app: Hono;

  beforeAll(() => {
    process.env.WAHA_API_KEY = 'dashboard-test-key';
    container.registerInstance(AuditService, auditDir());
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(SessionManager, {
      getSessions: async () => [
        { name: 'alpha', status: 'SCAN_QR_CODE', config: { engine: 'NOWEB' }, timestamps: { activity: 1 } },
      ],
      isRunning: () => false,
      getStatusSince: () => Date.now() - 60_000,
    } as any);
    app = new Hono();
    app.route('/api', createDashboardRouter());
  });

  it('answers the summary for an admin', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/dashboard/summary?range=1h', { headers: { 'x-api-key': 'dashboard-test-key' } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range.key).toBe('1h');
    expect(body.sessions[0]).toMatchObject({ name: 'alpha', status: 'SCAN_QR_CODE', engine: 'NOWEB' });
    expect(body.attention[0]).toMatchObject({ action: 'qr', session: 'alpha' });
    expect(body.server.store.driver).toBeDefined();
    expect(body.series.bucketStart).toHaveLength(12);
  });

  it('refuses a caller without credentials', async () => {
    const res = await app.fetch(new Request('http://localhost/api/dashboard/summary'));
    expect(res.status).toBe(401);
  });
});

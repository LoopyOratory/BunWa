import { describe, expect, test, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';
import { ANALYTICS_EVENT_TYPES } from '../core/agent/agent.analytics';

const dir = mkdtempSync(join(tmpdir(), 'bunwa-analytics-scope-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function makeStore(): SqlAgentStore {
  return new SqlAgentStore(
    new BunSqliteClient(new Database(join(dir, `analytics-${Math.random().toString(36).slice(2)}.sqlite`))),
  );
}

describe('analytics event scoping (S6)', () => {
  test('ANALYTICS_EVENT_TYPES covers every event type the reducer compares', () => {
    // The reducer in agent.analytics.ts compares these literals; keep the
    // store filter set in sync by construction.
    for (const type of [
      'agent.reply',
      'conversation.started',
      'conversation.closed',
      'conversion',
      'conversion.completed',
      'handoff.requested',
      'handoff.completed',
      'knowledge.search',
      'message.inbound',
      'message.outbound',
      'model.call',
      'model.error',
      'tool.call',
    ]) {
      expect(ANALYTICS_EVENT_TYPES).toContain(type);
    }
  });

  test('listEventsForAnalytics filters to the analytics scope and counts match', async () => {
    const store = makeStore();
    await store.init();
    const at = await store.createAgent({ name: 'Scope Probe', prompt: '', settings: {} } as any);

    // One event the dashboard consumes, two it ignores (volume telemetry).
    await store.recordEvent({ type: 'tool.call', agentId: at.id, conversationId: null, userId: null, data: { tool: 'SendText' } });
    await store.recordEvent({ type: 'message.ack', agentId: at.id, conversationId: null, userId: null, data: {} });
    await store.recordEvent({ type: 'engine.event', agentId: at.id, conversationId: null, userId: null, data: {} });

    const scoped = await store.listEventsForAnalytics({ types: [...ANALYTICS_EVENT_TYPES] });
    expect(scoped.map((e) => e.type).sort()).toEqual(['tool.call']);

    const count = await store.countEventsForAnalytics({ types: [...ANALYTICS_EVENT_TYPES] });
    expect(count).toBe(1);

    // Unfiltered reads (the raw events endpoint) still see everything.
    const all = await store.listEventsForAnalytics({});
    expect(all).toHaveLength(3);
  });
});

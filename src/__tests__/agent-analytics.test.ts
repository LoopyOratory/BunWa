import { describe, expect, test } from 'bun:test';
import {
  computeAgentAnalytics,
  resolveAnalyticsWindow,
} from '../core/agent/agent.analytics';
import type { Agent, AnalyticsEvent, Conversation } from '../core/agent/agent.types';

const now = new Date('2026-11-19T12:00:00.000Z');

function agent(id: string, name: string, status: Agent['status'] = 'active'): Agent {
  return {
    id,
    name,
    status,
    prompt: '',
    model: 'gemini-3.8-flash',
    fallbackModel: null,
    voice: null,
    settings: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function conversation(input: Partial<Conversation> & { id: string; agentId: string; startedAt: string }): Conversation {
  return {
    id: input.id,
    agentId: input.agentId,
    userId: input.userId ?? '233500000000@c.us',
    channel: input.channel ?? 'whatsapp',
    status: input.status ?? 'closed',
    reviewEnabled: input.reviewEnabled ?? true,
    reviewRequestedAt: input.reviewRequestedAt ?? null,
    reviewRating: input.reviewRating ?? null,
    reviewText: input.reviewText ?? null,
    metadata: input.metadata ?? {},
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? null,
  };
}

function event(input: Partial<AnalyticsEvent> & { id: string; type: string; createdAt: string }): AnalyticsEvent {
  return {
    id: input.id,
    type: input.type,
    agentId: input.agentId ?? null,
    conversationId: input.conversationId ?? null,
    userId: input.userId ?? null,
    data: input.data ?? {},
    createdAt: input.createdAt,
  };
}

describe('agent analytics', () => {
  test('resolves the current and previous window', () => {
    const window = resolveAnalyticsWindow('7d', null, null, now);
    expect(window.key).toBe('7d');
    expect(window.bucket).toBe('day');
    expect(new Date(window.from).getTime()).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(new Date(window.previousTo).getTime()).toBe(new Date(window.from).getTime());
  });

  test('computes KPIs, funnel, topics, tool health and knowledge gaps', () => {
    const window = resolveAnalyticsWindow('7d', null, null, now);
    const agents = [agent('a1', 'Vei Support'), agent('a2', 'Kofi Sales', 'paused')];
    const conversations: Conversation[] = [
      conversation({
        id: 'c1',
        agentId: 'a1',
        startedAt: '2026-11-18T09:00:00.000Z',
        endedAt: '2026-11-18T09:04:00.000Z',
        reviewRequestedAt: '2026-11-18T09:03:50.000Z',
        reviewRating: 5,
        metadata: { engaged: true, messageCount: 6, qualified: true, outcome: 'resolved', topic: 'Refunds', firstResponseMs: 900, costCents: 12 },
      }),
      conversation({
        id: 'c2',
        agentId: 'a1',
        startedAt: '2026-11-17T11:00:00.000Z',
        endedAt: '2026-11-17T11:10:00.000Z',
        reviewRating: 4,
        metadata: { engaged: true, messageCount: 8, qualified: true, outcome: 'converted', topic: 'Delivery', firstResponseMs: 1400, costCents: 20, currency: 'GHS' },
      }),
      conversation({
        id: 'c3',
        agentId: 'a2',
        startedAt: '2026-11-16T15:00:00.000Z',
        endedAt: '2026-11-16T15:20:00.000Z',
        status: 'open',
        metadata: { engaged: true, messageCount: 4, outcome: 'handoff', topic: 'Refunds', firstResponseMs: 2400, costCents: 8 },
      }),
    ];
    const events: AnalyticsEvent[] = [
      event({ id: 'e1', type: 'conversion', agentId: 'a1', conversationId: 'c2', createdAt: '2026-11-17T11:09:00.000Z', data: { valueCents: 12000, currency: 'GHS' } }),
      event({ id: 'e2', type: 'tool.call', agentId: 'a1', conversationId: 'c1', createdAt: '2026-11-18T09:01:00.000Z', data: { name: 'OrderLookup', durationMs: 120, ok: true } }),
      event({ id: 'e3', type: 'tool.call', agentId: 'a1', conversationId: 'c1', createdAt: '2026-11-18T09:02:00.000Z', data: { name: 'OrderLookup', durationMs: 240, ok: false, error: 'timeout' } }),
      event({ id: 'e6', type: 'tool.call', agentId: 'a1', conversationId: 'c1', createdAt: '2026-11-18T09:02:10.000Z', data: { name: 'OrderLookup', durationMs: 130, ok: true } }),
      event({ id: 'e7', type: 'tool.call', agentId: 'a1', conversationId: 'c2', createdAt: '2026-11-17T11:02:00.000Z', data: { name: 'OrderLookup', durationMs: 150, ok: true } }),
      event({ id: 'e8', type: 'tool.call', agentId: 'a1', conversationId: 'c2', createdAt: '2026-11-17T11:03:00.000Z', data: { name: 'OrderLookup', durationMs: 160, ok: true } }),
      event({ id: 'e4', type: 'knowledge.search', agentId: 'a1', conversationId: 'c1', createdAt: '2026-11-18T09:01:30.000Z', data: { query: 'return window', hit: false, score: 0.2 } }),
      event({ id: 'e5', type: 'knowledge.search', agentId: 'a1', conversationId: 'c1', createdAt: '2026-11-18T09:01:40.000Z', data: { query: 'return window', hit: false, score: 0.1 } }),
    ];
    const previous: Conversation[] = [
      conversation({
        id: 'p1',
        agentId: 'a1',
        startedAt: '2026-11-10T09:00:00.000Z',
        endedAt: '2026-11-10T09:05:00.000Z',
        reviewRating: 4,
        metadata: { engaged: true, messageCount: 4, outcome: 'resolved', firstResponseMs: 1200, costCents: 10 },
      }),
    ];
    const dashboard = computeAgentAnalytics({
      agents,
      conversations,
      events,
      previousConversations: previous,
      previousEvents: [],
      window,
      channel: 'all',
    });

    expect(dashboard.totals.conversations).toBe(3);
    expect(dashboard.totals.engaged).toBe(3);
    expect(dashboard.totals.resolved).toBe(2);
    expect(dashboard.totals.converted).toBe(1);
    expect(dashboard.totals.handoffs).toBe(1);
    expect(dashboard.totals.reviews).toBe(2);
    expect(dashboard.totals.averageRating).toBe(4.5);
    expect(dashboard.totals.currency).toBe('GHS');
    expect(dashboard.kpis.conversations.value).toBe(3);
    expect(dashboard.kpis.conversations.previous).toBe(1);
    expect(dashboard.kpis.conversations.delta).toBe(2);
    expect(dashboard.funnel).toEqual({ started: 3, engaged: 3, qualified: 3, resolved: 2, converted: 1 });
    expect(dashboard.leaderboard[0].agentName).toBe('Vei Support');
    expect(dashboard.leaderboard[0].csat).toBe(4.5);
    expect(dashboard.topics[0].topic).toBe('Refunds');
    expect(dashboard.tools[0].name).toBe('OrderLookup');
    expect(dashboard.tools[0].calls).toBe(5);
    expect(dashboard.tools[0].failures).toBe(1);
    expect(dashboard.knowledgeGaps[0].query).toBe('return window');
    expect(dashboard.knowledgeGaps[0].count).toBe(2);
    expect(dashboard.attention.some((item) => item.title === 'Tool calls are failing')).toBe(true);
    expect(dashboard.recentConversations).toHaveLength(3);
    expect(dashboard.series.length).toBeGreaterThan(1);
  });

  test('returns empty, honest metrics when there is no data', () => {
    const window = resolveAnalyticsWindow('24h', null, null, now);
    const dashboard = computeAgentAnalytics({
      agents: [],
      conversations: [],
      events: [],
      previousConversations: [],
      previousEvents: [],
      window,
      channel: 'all',
    });
    expect(dashboard.totals.conversations).toBe(0);
    expect(dashboard.kpis.resolution.value).toBeNull();
    expect(dashboard.kpis.csat.value).toBeNull();
    expect(dashboard.attention[0].title).toBe('No agents yet');
    expect(dashboard.leaderboard).toEqual([]);
    expect(dashboard.topics).toEqual([]);
  });
});

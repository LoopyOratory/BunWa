/**
 * Agent analytics: one pure computation over conversations, events and agents.
 *
 * The store returns rows for a date window; this file turns them into the
 * dashboard shape the UI consumes. Keeping the maths here means the REST
 * endpoint, tests and future rollups all agree on what a metric means.
 */
import type { Agent, AnalyticsEvent, Conversation } from './agent.types';

export type AnalyticsRangeKey = '24h' | '7d' | '30d' | '90d';
export type AnalyticsChannel = 'all' | 'whatsapp' | 'voice';
export type AnalyticsUnit = 'count' | 'percent' | 'ms' | 'currency' | 'rating';

export interface AnalyticsWindow {
  key: AnalyticsRangeKey;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  bucket: 'hour' | 'day';
}

export interface AnalyticsKpi {
  value: number | null;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
  sample: number;
  unit: AnalyticsUnit;
}

export interface AnalyticsSeriesPoint {
  bucket: string;
  label: string;
  started: number;
  engaged: number;
  resolved: number;
  converted: number;
  handoffs: number;
  reviews: number;
  avgRating: number | null;
  medianResponseMs: number | null;
  costCents: number;
}

export interface AnalyticsFunnel {
  started: number;
  engaged: number;
  qualified: number;
  resolved: number;
  converted: number;
}

export interface AnalyticsLeaderboardRow {
  agentId: string;
  agentName: string;
  status: Agent['status'];
  conversations: number;
  resolved: number;
  resolutionRate: number | null;
  conversionRate: number | null;
  csat: number | null;
  reviews: number;
  medianResponseMs: number | null;
  costCents: number;
  costPerConversationCents: number | null;
  sparkline: number[];
}

export interface AnalyticsAttentionItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  agentId?: string;
  agentName?: string;
}

export interface AnalyticsTopicRow {
  topic: string;
  conversations: number;
  resolved: number;
  conversionRate: number | null;
  share: number;
}

export interface AnalyticsToolRow {
  name: string;
  calls: number;
  successes: number;
  failures: number;
  successRate: number | null;
  p95Ms: number | null;
}

export interface AnalyticsKnowledgeGap {
  query: string;
  count: number;
  agentId: string | null;
  agentName: string | null;
  lastSeenAt: string;
}

export interface AnalyticsRecentConversation {
  id: string;
  agentId: string;
  agentName: string;
  channel: string;
  status: Conversation['status'];
  outcome: ConversationOutcome;
  topic: string | null;
  rating: number | null;
  messages: number;
  durationMs: number | null;
  startedAt: string;
}

export type ConversationOutcome = 'resolved' | 'converted' | 'handoff' | 'abandoned' | 'open' | 'unclassified';

export interface AgentAnalyticsTotals {
  conversations: number;
  engaged: number;
  resolved: number;
  converted: number;
  handoffs: number;
  reviews: number;
  averageRating: number | null;
  reviewResponseRate: number | null;
  totalCostCents: number;
  currency: string;
}

export interface AgentAnalyticsDashboard {
  range: AnalyticsRangeKey;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  agentId: string | null;
  channel: AnalyticsChannel;
  currency: string;
  totals: AgentAnalyticsTotals;
  kpis: {
    conversations: AnalyticsKpi;
    resolution: AnalyticsKpi;
    csat: AnalyticsKpi;
    firstResponse: AnalyticsKpi;
    handoffs: AnalyticsKpi;
    cost: AnalyticsKpi;
  };
  series: AnalyticsSeriesPoint[];
  csatDistribution: number[];
  funnel: AnalyticsFunnel;
  leaderboard: AnalyticsLeaderboardRow[];
  attention: AnalyticsAttentionItem[];
  topics: AnalyticsTopicRow[];
  tools: AnalyticsToolRow[];
  knowledgeGaps: AnalyticsKnowledgeGap[];
  recentConversations: AnalyticsRecentConversation[];
  generatedAt: string;
}

export interface AnalyticsComputationInput {
  agents: Agent[];
  conversations: Conversation[];
  events: AnalyticsEvent[];
  previousConversations: Conversation[];
  previousEvents: AnalyticsEvent[];
  window: AnalyticsWindow;
  agentId?: string | null;
  channel: AnalyticsChannel;
}

const RANGE_MS: Record<AnalyticsRangeKey, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export function isAnalyticsRange(value: string | undefined): value is AnalyticsRangeKey {
  return value === '24h' || value === '7d' || value === '30d' || value === '90d';
}

export function isAnalyticsChannel(value: string | undefined): value is AnalyticsChannel {
  return value === 'all' || value === 'whatsapp' || value === 'voice';
}

/** Date-only inputs from a date picker are whole days, not midnight boundaries. */
function parseWindowBoundary(value: string | null | undefined, boundary: 'start' | 'end'): Date | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const candidate = dateOnly
    ? new Date(`${value}T${boundary === 'end' ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(value);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

/** Resolve a range key (or an explicit from/to pair) into the current and previous windows. */
export function resolveAnalyticsWindow(
  range: AnalyticsRangeKey,
  from?: string | null,
  to?: string | null,
  now = new Date(),
): AnalyticsWindow {
  const explicitFrom = parseWindowBoundary(from, 'start');
  const explicitTo = parseWindowBoundary(to, 'end');
  const validFrom = explicitFrom;
  const validTo = explicitTo;

  if (validFrom && validTo && validTo.getTime() > validFrom.getTime()) {
    const span = validTo.getTime() - validFrom.getTime();
    return {
      key: range,
      from: validFrom.toISOString(),
      to: validTo.toISOString(),
      previousFrom: new Date(validFrom.getTime() - span).toISOString(),
      previousTo: validFrom.toISOString(),
      bucket: span <= 48 * 60 * 60 * 1000 ? 'hour' : 'day',
    };
  }

  const end = now;
  const start = new Date(end.getTime() - RANGE_MS[range]);
  return {
    key: range,
    from: start.toISOString(),
    to: end.toISOString(),
    previousFrom: new Date(start.getTime() - RANGE_MS[range]).toISOString(),
    previousTo: start.toISOString(),
    bucket: range === '24h' ? 'hour' : 'day',
  };
}

function bucketKey(value: string | Date, bucket: 'hour' | 'day'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  if (bucket === 'day') return date.toISOString().slice(0, 10);
  return `${date.toISOString().slice(0, 13)}:00:00.000Z`;
}

function bucketLabel(key: string, bucket: 'hour' | 'day'): string {
  const date = new Date(bucket === 'day' ? `${key}T00:00:00.000Z` : key);
  if (Number.isNaN(date.getTime())) return key;
  if (bucket === 'hour') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  }
  return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function bucketStarts(from: string, to: string, bucket: 'hour' | 'day'): string[] {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const cursor = new Date(start);
  if (bucket === 'day') cursor.setUTCHours(0, 0, 0, 0);
  else cursor.setUTCMinutes(0, 0, 0);
  const keys: string[] = [];
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    keys.push(bucketKey(cursor, bucket));
    if (bucket === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else cursor.setUTCHours(cursor.getUTCHours() + 1);
    guard += 1;
  }
  return keys;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function metadataOf(conversation: Conversation): Record<string, unknown> {
  return conversation.metadata && typeof conversation.metadata === 'object' ? conversation.metadata : {};
}

function eventData(event: AnalyticsEvent): Record<string, unknown> {
  return event.data && typeof event.data === 'object' ? event.data : {};
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function outcomeOf(conversation: Conversation, events: AnalyticsEvent[]): ConversationOutcome {
  const raw = String(metadataOf(conversation).outcome ?? '').toLowerCase();
  if (raw === 'resolved' || raw === 'converted' || raw === 'handoff' || raw === 'abandoned' || raw === 'open') {
    return raw;
  }
  if (events.some((event) => event.type === 'conversion' || event.type === 'conversion.completed')) return 'converted';
  if (events.some((event) => event.type === 'handoff.requested' || event.type === 'handoff.completed')) return 'handoff';
  if (conversation.status === 'open') return 'open';
  if (conversation.status === 'closed') return 'resolved';
  return 'unclassified';
}

function topicOf(conversation: Conversation, events: AnalyticsEvent[]): string | null {
  const meta = metadataOf(conversation);
  if (typeof meta.topic === 'string' && meta.topic.trim()) return meta.topic.trim();
  const started = events.find((event) => event.type === 'conversation.started');
  const data = started ? eventData(started) : {};
  if (typeof data.topic === 'string' && data.topic.trim()) return data.topic.trim();
  return null;
}

function messageCountOf(conversation: Conversation, events: AnalyticsEvent[]): number {
  const meta = numeric(metadataOf(conversation).messageCount) ?? numeric(metadataOf(conversation).messages);
  if (meta !== null) return Math.max(0, Math.round(meta));
  return events.filter((event) => event.type === 'message.inbound' || event.type === 'message.outbound').length;
}

function firstResponseMsOf(conversation: Conversation, events: AnalyticsEvent[]): number | null {
  const meta = numeric(metadataOf(conversation).firstResponseMs) ?? numeric(metadataOf(conversation).responseMs);
  if (meta !== null) return meta;
  for (const event of events) {
    if (event.type !== 'message.outbound' && event.type !== 'agent.reply') continue;
    const data = eventData(event);
    const value = numeric(data.firstResponseMs) ?? numeric(data.responseMs) ?? numeric(data.latencyMs);
    if (value !== null) return value;
  }
  return null;
}

function costCentsOf(conversation: Conversation, events: AnalyticsEvent[]): number {
  const meta = numeric(metadataOf(conversation).costCents);
  if (meta !== null) return meta;
  return events.reduce((sum, event) => {
    if (event.type !== 'model.call' && event.type !== 'tool.call') return sum;
    return sum + (numeric(eventData(event).costCents) ?? 0);
  }, 0);
}

function ratingOf(conversation: Conversation): number | null {
  return conversation.reviewRating === null ? null : conversation.reviewRating;
}

function reviewRequestedOf(conversation: Conversation): boolean {
  return Boolean(conversation.reviewRequestedAt || conversation.reviewRating !== null);
}

function isEngaged(conversation: Conversation, events: AnalyticsEvent[]): boolean {
  const meta = metadataOf(conversation);
  if (bool(meta.engaged)) return true;
  if (messageCountOf(conversation, events) >= 2) return true;
  if (firstResponseMsOf(conversation, events) !== null) return true;
  if (reviewRequestedOf(conversation)) return true;
  return events.some((event) => event.type === 'message.outbound' || event.type === 'agent.reply');
}

function isQualified(conversation: Conversation, events: AnalyticsEvent[], outcome: ConversationOutcome): boolean {
  const meta = metadataOf(conversation);
  if (meta.qualified !== undefined) return bool(meta.qualified);
  return outcome === 'converted' || outcome === 'handoff' || events.some((event) => event.type === 'conversion');
}

function durationOf(conversation: Conversation): number | null {
  if (!conversation.endedAt) return null;
  const started = new Date(conversation.startedAt).getTime();
  const ended = new Date(conversation.endedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended) || ended < started) return null;
  return ended - started;
}

function pct(value: number, whole: number): number | null {
  return whole > 0 ? value / whole : null;
}

function kpi(value: number | null, previous: number | null, unit: AnalyticsUnit, sample: number): AnalyticsKpi {
  const delta = value === null || previous === null ? null : value - previous;
  const deltaPct =
    unit === 'count' || unit === 'currency'
      ? previous !== null && previous !== 0 && delta !== null
        ? (delta / Math.abs(previous)) * 100
        : null
      : null;
  return { value, previous, delta, deltaPct, sample, unit };
}

function metricsOf(conversations: Conversation[], events: AnalyticsEvent[]) {
  const eventsByConversation = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    if (!event.conversationId) continue;
    const list = eventsByConversation.get(event.conversationId) ?? [];
    list.push(event);
    eventsByConversation.set(event.conversationId, list);
  }

  let engaged = 0;
  let resolved = 0;
  let converted = 0;
  let handoffs = 0;
  let reviews = 0;
  let reviewRequested = 0;
  let qualified = 0;
  let totalCostCents = 0;
  const ratings: number[] = [];
  const ratingCounts = [0, 0, 0, 0, 0];
  const responseTimes: number[] = [];

  for (const conversation of conversations) {
    const conversationEvents = eventsByConversation.get(conversation.id) ?? [];
    const outcome = outcomeOf(conversation, conversationEvents);
    const engagedHere = isEngaged(conversation, conversationEvents);
    if (engagedHere) engaged += 1;
    if (outcome === 'resolved' || outcome === 'converted') resolved += 1;
    if (outcome === 'converted') converted += 1;
    if (outcome === 'handoff') handoffs += 1;
    if (isQualified(conversation, conversationEvents, outcome)) qualified += 1;
    const rating = ratingOf(conversation);
    if (rating !== null) {
      reviews += 1;
      ratings.push(rating);
      ratingCounts[Math.min(5, Math.max(1, Math.round(rating))) - 1] += 1;
    }
    if (reviewRequestedOf(conversation)) reviewRequested += 1;
    const response = firstResponseMsOf(conversation, conversationEvents);
    if (response !== null) responseTimes.push(response);
    totalCostCents += costCentsOf(conversation, conversationEvents);
  }

  return {
    eventsByConversation,
    conversations: conversations.length,
    engaged,
    qualified,
    resolved,
    converted,
    handoffs,
    reviews,
    reviewRequested,
    ratings,
    ratingCounts,
    responseTimes,
    totalCostCents,
    averageRating: average(ratings),
    reviewResponseRate: pct(reviews, reviewRequested),
    resolutionRate: pct(resolved, engaged),
    conversionRate: pct(converted, conversations.length),
    handoffRate: pct(handoffs, engaged),
    medianResponseMs: median(responseTimes),
    costPerConversationCents: conversations.length ? totalCostCents / conversations.length : null,
  };
}

function buildSeries(
  conversations: Conversation[],
  events: AnalyticsEvent[],
  window: AnalyticsWindow,
): AnalyticsSeriesPoint[] {
  const eventsByConversation = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    if (!event.conversationId) continue;
    const list = eventsByConversation.get(event.conversationId) ?? [];
    list.push(event);
    eventsByConversation.set(event.conversationId, list);
  }

  const keys = bucketStarts(window.from, window.to, window.bucket);
  const points = new Map<string, AnalyticsSeriesPoint & { ratingValues: number[]; responseValues: number[] }>();
  for (const key of keys) {
    points.set(key, {
      bucket: key,
      label: bucketLabel(key, window.bucket),
      started: 0,
      engaged: 0,
      resolved: 0,
      converted: 0,
      handoffs: 0,
      reviews: 0,
      avgRating: null,
      medianResponseMs: null,
      costCents: 0,
      ratingValues: [],
      responseValues: [],
    });
  }

  for (const conversation of conversations) {
    const conversationEvents = eventsByConversation.get(conversation.id) ?? [];
    const outcome = outcomeOf(conversation, conversationEvents);
    const startedKey = bucketKey(conversation.startedAt, window.bucket);
    const startedPoint = points.get(startedKey);
    if (startedPoint) {
      startedPoint.started += 1;
      if (isEngaged(conversation, conversationEvents)) startedPoint.engaged += 1;
    }

    const outcomeKey = bucketKey(conversation.endedAt ?? conversation.startedAt, window.bucket);
    const outcomePoint = points.get(outcomeKey);
    if (outcomePoint) {
      if (outcome === 'resolved' || outcome === 'converted') outcomePoint.resolved += 1;
      if (outcome === 'converted') outcomePoint.converted += 1;
      if (outcome === 'handoff') outcomePoint.handoffs += 1;
      const rating = ratingOf(conversation);
      if (rating !== null) {
        outcomePoint.reviews += 1;
        outcomePoint.ratingValues.push(rating);
      }
      const response = firstResponseMsOf(conversation, conversationEvents);
      if (response !== null) outcomePoint.responseValues.push(response);
      outcomePoint.costCents += costCentsOf(conversation, conversationEvents);
    }
  }

  return keys.map((key) => {
    const point = points.get(key)!;
    const { ratingValues, responseValues, ...rest } = point;
    return {
      ...rest,
      avgRating: average(ratingValues),
      medianResponseMs: median(responseValues),
    };
  });
}

function buildLeaderboard(
  agents: Agent[],
  conversations: Conversation[],
  events: AnalyticsEvent[],
  window: AnalyticsWindow,
): AnalyticsLeaderboardRow[] {
  const byAgent = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const list = byAgent.get(conversation.agentId) ?? [];
    list.push(conversation);
    byAgent.set(conversation.agentId, list);
  }
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const keys = bucketStarts(window.from, window.to, window.bucket);

  return [...byAgent.entries()]
    .map(([agentId, agentConversations]) => {
      const metrics = metricsOf(agentConversations, events);
      const agent = agentById.get(agentId);
      const sparkline = keys.map((key) => agentConversations.filter((conversation) => bucketKey(conversation.startedAt, window.bucket) === key).length);
      return {
        agentId,
        agentName: agent?.name ?? 'Deleted agent',
        status: agent?.status ?? 'draft',
        conversations: metrics.conversations,
        resolved: metrics.resolved,
        resolutionRate: metrics.resolutionRate,
        conversionRate: metrics.conversionRate,
        csat: metrics.averageRating,
        reviews: metrics.reviews,
        medianResponseMs: metrics.medianResponseMs,
        costCents: metrics.totalCostCents,
        costPerConversationCents: metrics.costPerConversationCents,
        sparkline,
      };
    })
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, 8);
}

function buildAttention(
  agents: Agent[],
  conversations: Conversation[],
  events: AnalyticsEvent[],
): AnalyticsAttentionItem[] {
  const items: AnalyticsAttentionItem[] = [];
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const conversationsByAgent = new Map<string, Conversation[]>();
  const eventsByAgent = new Map<string, AnalyticsEvent[]>();
  for (const conversation of conversations) {
    const list = conversationsByAgent.get(conversation.agentId) ?? [];
    list.push(conversation);
    conversationsByAgent.set(conversation.agentId, list);
  }
  for (const event of events) {
    if (!event.agentId) continue;
    const list = eventsByAgent.get(event.agentId) ?? [];
    list.push(event);
    eventsByAgent.set(event.agentId, list);
  }

  for (const [agentId, agentConversations] of conversationsByAgent) {
    const agent = agentById.get(agentId);
    if (!agent) continue;
    const agentEvents = eventsByAgent.get(agentId) ?? [];
    const metrics = metricsOf(agentConversations, agentEvents);
    const base = { agentId, agentName: agent.name };

    if (agent.status === 'paused' && agentConversations.length > 0) {
      items.push({
        ...base,
        id: `paused:${agentId}`,
        severity: 'info',
        title: `${agent.name} is paused`,
        detail: `${agentConversations.length} conversation${agentConversations.length === 1 ? '' : 's'} in this range.`,
      });
    }
    if (metrics.engaged >= 5 && (metrics.handoffRate ?? 0) > 0.3) {
      items.push({
        ...base,
        id: `handoff:${agentId}`,
        severity: 'warning',
        title: 'High handoff rate',
        detail: `${Math.round((metrics.handoffRate ?? 0) * 100)}% of engaged conversations needed a human.`,
      });
    }
    if (metrics.reviews >= 3 && metrics.averageRating !== null && metrics.averageRating < 4) {
      items.push({
        ...base,
        id: `csat:${agentId}`,
        severity: 'warning',
        title: 'CSAT is below 4.0',
        detail: `${metrics.averageRating.toFixed(1)} from ${metrics.reviews} reviews. Read the comments before changing the prompt.`,
      });
    }
    const toolCalls = agentEvents.filter((event) => event.type === 'tool.call');
    const toolFailures = toolCalls.filter((event) => {
      const data = eventData(event);
      return data.ok === false || data.success === false || Boolean(data.error);
    });
    if (toolCalls.length >= 5 && toolFailures.length / toolCalls.length > 0.05) {
      items.push({
        ...base,
        id: `tools:${agentId}`,
        severity: 'critical',
        title: 'Tool calls are failing',
        detail: `${toolFailures.length} of ${toolCalls.length} calls failed in this range.`,
      });
    }
    const modelErrors = agentEvents.filter((event) => event.type === 'model.error' || (event.type === 'model.call' && eventData(event).ok === false));
    if (modelErrors.length > 0) {
      items.push({
        ...base,
        id: `model:${agentId}`,
        severity: 'critical',
        title: 'Model errors recorded',
        detail: `${modelErrors.length} model call${modelErrors.length === 1 ? '' : 's'} failed. Check the provider and fallback.`,
      });
    }
    const searches = agentEvents.filter((event) => event.type === 'knowledge.search');
    const misses = searches.filter((event) => {
      const data = eventData(event);
      return data.hit === false || (numeric(data.score) !== null && (numeric(data.score) as number) < 0.45);
    });
    if (searches.length >= 5 && misses.length / searches.length > 0.2) {
      items.push({
        ...base,
        id: `knowledge:${agentId}`,
        severity: 'warning',
        title: 'Knowledge searches are missing',
        detail: `${misses.length} of ${searches.length} searches found no useful passage.`,
      });
    }
    const stale = agentConversations.filter((conversation) => {
      if (conversation.status !== 'open') return false;
      return Date.now() - new Date(conversation.startedAt).getTime() > 24 * 60 * 60 * 1000;
    });
    if (stale.length > 0) {
      items.push({
        ...base,
        id: `stale:${agentId}`,
        severity: 'warning',
        title: 'Open conversations are going stale',
        detail: `${stale.length} conversation${stale.length === 1 ? '' : 's'} open for more than 24 hours.`,
      });
    }
  }

  if (agents.length === 0) {
    items.push({
      id: 'no-agents',
      severity: 'info',
      title: 'No agents yet',
      detail: 'Create an agent to start collecting conversation analytics.',
    });
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 4);
}

function buildTopics(conversations: Conversation[], events: AnalyticsEvent[]): AnalyticsTopicRow[] {
  const eventsByConversation = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    if (!event.conversationId) continue;
    const list = eventsByConversation.get(event.conversationId) ?? [];
    list.push(event);
    eventsByConversation.set(event.conversationId, list);
  }
  const topics = new Map<string, { conversations: number; resolved: number; converted: number }>();
  for (const conversation of conversations) {
    const topic = topicOf(conversation, eventsByConversation.get(conversation.id) ?? []);
    if (!topic) continue;
    const row = topics.get(topic) ?? { conversations: 0, resolved: 0, converted: 0 };
    row.conversations += 1;
    const outcome = outcomeOf(conversation, eventsByConversation.get(conversation.id) ?? []);
    if (outcome === 'resolved' || outcome === 'converted') row.resolved += 1;
    if (outcome === 'converted') row.converted += 1;
    topics.set(topic, row);
  }
  return [...topics.entries()]
    .map(([topic, row]) => ({
      topic,
      conversations: row.conversations,
      resolved: row.resolved,
      conversionRate: pct(row.converted, row.conversations),
      share: pct(row.conversations, conversations.length) ?? 0,
    }))
    .sort((a, b) => b.conversations - a.conversations)
    .slice(0, 8);
}

function buildTools(events: AnalyticsEvent[]): AnalyticsToolRow[] {
  const tools = new Map<string, { calls: number; successes: number; failures: number; durations: number[] }>();
  for (const event of events) {
    if (event.type !== 'tool.call') continue;
    const data = eventData(event);
    const name = typeof data.name === 'string' ? data.name : typeof data.tool === 'string' ? data.tool : 'Unknown tool';
    const row = tools.get(name) ?? { calls: 0, successes: 0, failures: 0, durations: [] };
    row.calls += 1;
    const failed = data.ok === false || data.success === false || Boolean(data.error);
    if (failed) row.failures += 1;
    else row.successes += 1;
    const duration = numeric(data.durationMs) ?? numeric(data.latencyMs);
    if (duration !== null) row.durations.push(duration);
    tools.set(name, row);
  }
  return [...tools.entries()]
    .map(([name, row]) => ({
      name,
      calls: row.calls,
      successes: row.successes,
      failures: row.failures,
      successRate: pct(row.successes, row.calls),
      p95Ms: percentile(row.durations, 95),
    }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 8);
}

function buildKnowledgeGaps(events: AnalyticsEvent[], agents: Agent[]): AnalyticsKnowledgeGap[] {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const gaps = new Map<string, { query: string; count: number; agentId: string | null; lastSeenAt: string }>();
  for (const event of events) {
    if (event.type !== 'knowledge.search') continue;
    const data = eventData(event);
    const score = numeric(data.score);
    const missed = data.hit === false || (score !== null && score < 0.45) || bool(data.unanswered);
    if (!missed) continue;
    const query = typeof data.query === 'string' ? data.query.trim() : '';
    if (!query) continue;
    const key = `${event.agentId ?? 'none'}:${query.toLowerCase()}`;
    const current = gaps.get(key);
    if (current) {
      current.count += 1;
      if (event.createdAt > current.lastSeenAt) current.lastSeenAt = event.createdAt;
    } else {
      gaps.set(key, { query, count: 1, agentId: event.agentId, lastSeenAt: event.createdAt });
    }
  }
  return [...gaps.values()]
    .map((row) => ({
      query: row.query,
      count: row.count,
      agentId: row.agentId,
      agentName: row.agentId ? agentById.get(row.agentId)?.name ?? null : null,
      lastSeenAt: row.lastSeenAt,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildRecent(
  conversations: Conversation[],
  events: AnalyticsEvent[],
  agents: Agent[],
): AnalyticsRecentConversation[] {
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const eventsByConversation = new Map<string, AnalyticsEvent[]>();
  for (const event of events) {
    if (!event.conversationId) continue;
    const list = eventsByConversation.get(event.conversationId) ?? [];
    list.push(event);
    eventsByConversation.set(event.conversationId, list);
  }
  return [...conversations]
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 8)
    .map((conversation) => {
      const conversationEvents = eventsByConversation.get(conversation.id) ?? [];
      return {
        id: conversation.id,
        agentId: conversation.agentId,
        agentName: agentById.get(conversation.agentId)?.name ?? 'Deleted agent',
        channel: conversation.channel,
        status: conversation.status,
        outcome: outcomeOf(conversation, conversationEvents),
        topic: topicOf(conversation, conversationEvents),
        rating: ratingOf(conversation),
        messages: messageCountOf(conversation, conversationEvents),
        durationMs: durationOf(conversation),
        startedAt: conversation.startedAt,
      };
    });
}

function currencyOf(conversations: Conversation[], events: AnalyticsEvent[]): string {
  for (const conversation of conversations) {
    const value = metadataOf(conversation).currency;
    if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  }
  for (const event of events) {
    const value = eventData(event).currency;
    if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  }
  return 'GHS';
}

/** Compute the complete dashboard payload from already-filtered rows. */
export function computeAgentAnalytics(input: AnalyticsComputationInput): AgentAnalyticsDashboard {
  const { agents, conversations, events, previousConversations, previousEvents, window, channel } = input;
  const current = metricsOf(conversations, events);
  const previous = metricsOf(previousConversations, previousEvents);
  const series = buildSeries(conversations, events, window);
  const totalCost = current.totalCostCents;
  const previousCost = previous.totalCostCents;
  const currency = currencyOf(conversations, events);
  const funnel: AnalyticsFunnel = {
    started: current.conversations,
    engaged: current.engaged,
    qualified: current.qualified,
    resolved: current.resolved,
    converted: current.converted,
  };

  return {
    range: window.key,
    from: window.from,
    to: window.to,
    previousFrom: window.previousFrom,
    previousTo: window.previousTo,
    agentId: input.agentId ?? null,
    channel,
    currency,
    totals: {
      conversations: current.conversations,
      engaged: current.engaged,
      resolved: current.resolved,
      converted: current.converted,
      handoffs: current.handoffs,
      reviews: current.reviews,
      averageRating: current.averageRating,
      reviewResponseRate: current.reviewResponseRate,
      totalCostCents: totalCost,
      currency,
    },
    kpis: {
      conversations: kpi(current.conversations, previous.conversations, 'count', current.conversations),
      resolution: kpi(current.resolutionRate, previous.resolutionRate, 'percent', current.engaged),
      csat: kpi(current.averageRating, previous.averageRating, 'rating', current.reviews),
      firstResponse: kpi(current.medianResponseMs, previous.medianResponseMs, 'ms', current.responseTimes.length),
      handoffs: kpi(current.handoffs, previous.handoffs, 'count', current.engaged),
      cost: kpi(current.costPerConversationCents, previous.costPerConversationCents, 'currency', current.conversations),
    },
    series,
    csatDistribution: current.ratingCounts,
    funnel,
    leaderboard: buildLeaderboard(agents, conversations, events, window),
    attention: buildAttention(agents, conversations, events),
    topics: buildTopics(conversations, events),
    tools: buildTools(events),
    knowledgeGaps: buildKnowledgeGaps(events, agents),
    recentConversations: buildRecent(conversations, events, agents),
    generatedAt: new Date().toISOString(),
  };
}

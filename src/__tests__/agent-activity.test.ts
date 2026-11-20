import 'reflect-metadata';
import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';
import { AgentService, agentService, setAgentStoreForTests } from '../core/agent/agent.service';
import { createAgentsActivityStreamRouter, createAgentsRouter } from '../api/agents.routes';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { WhatsappConfigService } from '../config.service';

process.env.BUNWA_KEY_ENCRYPTION_SECRET ??= 'test-secret';

function makeStore(): SqlAgentStore {
  return new SqlAgentStore(new BunSqliteClient(new Database(':memory:')));
}

async function makeServiceWithActiveAgent(name = 'Vei Support') {
  const store = makeStore();
  await store.init();
  setAgentStoreForTests(store);
  const service = new AgentService();
  const created = await service.createAgent({ name, prompt: 'Help customers.' });
  const agent = (await service.updateAgent(created.id, { status: 'active' }))!;
  return { service, agent, store };
}

describe('agent live engagement', () => {
  afterEach(() => {
    setAgentStoreForTests(null);
  });

  test('heartbeat reports an engagement and preserves since across beats', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      const t0 = Date.now();
      const engaged = service.reportActivity(agent.id, { kind: 'voice', active: true, contact: '+233 50 000 0000' }, t0);
      expect(engaged?.kind).toBe('voice');
      expect(engaged?.contact).toBe('+233 50 000 0000');
      expect(engaged?.since).toBe(engaged?.lastBeatAt);

      // A second beat 5 s later keeps the original `since`.
      const next = service.reportActivity(agent.id, { kind: 'voice', active: true }, t0 + 5_000);
      expect(next?.since).toBe(engaged?.since);
      expect(Date.parse(next!.lastBeatAt)).toBe(t0 + 5_000);

      // A different kind starts a fresh interaction.
      const switched = service.reportActivity(agent.id, { kind: 'chat', active: true, conversationId: 'c1' }, t0 + 6_000);
      expect(switched?.kind).toBe('chat');
      expect(switched?.conversationId).toBe('c1');
      expect(switched?.since).not.toBe(engaged?.since);
    } finally {
      store.close();
    }
  });

  test('active false ends the engagement and notifies listeners', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      const events: Array<{ agentId: string; engaged: unknown }> = [];
      const unsubscribe = service.onEngagementChange((change) => events.push(change));
      service.reportActivity(agent.id, { kind: 'chat', active: true });
      expect(events).toHaveLength(1);
      expect((events[0] as any).engaged.kind).toBe('chat');

      const ended = service.reportActivity(agent.id, { kind: 'chat', active: false });
      expect(ended).toBeNull();
      expect(events).toHaveLength(2);
      expect(events[1].engaged).toBeNull();
      expect(service.listEngagements()).toHaveLength(0);
      unsubscribe();
      service.reportActivity(agent.id, { kind: 'chat', active: true });
      expect(events).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  test('engagements prune after the TTL window', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      const t0 = Date.now();
      service.reportActivity(agent.id, { kind: 'voice', active: true }, t0);
      // Still live one beat-interval later.
      expect(service.listEngagements(t0 + 5_000)).toHaveLength(1);
      // Dead once the last beat is older than the 15 s TTL.
      expect(service.listEngagements(t0 + AgentService.ENGAGEMENT_TTL_MS + 1)).toHaveLength(0);
      // The pruned entry notifies its listeners so streams clear instantly.
      const seen: unknown[] = [];
      const unsubscribe = service.onEngagementChange((change) => seen.push(change));
      service.reportActivity(agent.id, { kind: 'voice', active: true }, t0);
      service.listEngagements(t0 + AgentService.ENGAGEMENT_TTL_MS + 1);
      expect(seen.length).toBeGreaterThan(0);
      unsubscribe();
    } finally {
      store.close();
    }
  });

  test('paused agents never list as live, but the raw engagement survives', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      service.reportActivity(agent.id, { kind: 'voice', active: true });
      await service.updateAgent(agent.id, { status: 'paused' });
      const listed = await service.listAgentsWithEngagement();
      expect(listed.find((row) => row.id === agent.id)?.engaged).toBeNull();
      // The runtime may still be mid-call; the state is real even if hidden.
      expect(service.listEngagements()).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test('liveNowSnapshot counts voice and chat and honours the agent filter', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      const other = await service.createAgent({ name: 'Kofi Sales', prompt: 'Sell.' });
      service.reportActivity(agent.id, { kind: 'voice', active: true, contact: 'Ama' });
      service.reportActivity(other.id, { kind: 'chat', active: true, conversationId: 'c9' });

      const all = service.liveNowSnapshot([agent, other], null);
      expect(all.count).toBe(2);
      expect(all.voice).toBe(1);
      expect(all.chat).toBe(1);
      expect(all.agents.find((row) => row.id === agent.id)?.contact).toBe('Ama');

      const scoped = service.liveNowSnapshot([agent, other], other.id);
      expect(scoped.count).toBe(1);
      expect(scoped.agents[0].kind).toBe('chat');
      expect(scoped.agents[0].name).toBe('Kofi Sales');
    } finally {
      store.close();
    }
  });

  test('deleting an agent clears its engagement', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      service.reportActivity(agent.id, { kind: 'voice', active: true });
      await service.deleteAgent(agent.id);
      expect(service.listEngagements()).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test('invalid kind is rejected', async () => {
    const { service, agent, store } = await makeServiceWithActiveAgent();
    try {
      expect(() => service.reportActivity(agent.id, { kind: 'smoke-signal' as never, active: true })).toThrow(
        'kind must be "voice" or "chat"',
      );
    } finally {
      store.close();
    }
  });

  test('activity routes validate input and expose live state', async () => {
    const previousKey = process.env.WAHA_API_KEY;
    process.env.WAHA_API_KEY = 'waha';
    // The auth middleware resolves these through tsyringe; without shared
    // instances a request 500s before reaching the route (same fix as
    // sessions.test.ts, bound to a temp dir so the real audit DB is untouched).
    container.registerInstance(AuditService, new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-audit-'))));
    container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
    container.registerInstance(SessionManager, new SessionManager(container.resolve(WhatsappConfigService)));
    const { service, agent, store } = await makeServiceWithActiveAgent();
    const app = new Hono();
    app.route('/api/agents', createAgentsRouter());
    const auth = { 'Content-Type': 'application/json', 'X-Api-Key': 'waha' };
    try {
      const badKind = await app.request(`/api/agents/${agent.id}/activity`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ kind: 'fax', active: true }),
      });
      expect(badKind.status).toBe(400);

      const badActive = await app.request(`/api/agents/${agent.id}/activity`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ kind: 'voice' }),
      });
      expect(badActive.status).toBe(400);

      const missing = await app.request('/api/agents/does-not-exist/activity', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ kind: 'voice', active: true }),
      });
      expect(missing.status).toBe(404);

      const ok = await app.request(`/api/agents/${agent.id}/activity`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ kind: 'voice', active: true, contact: 'Ama Mensah' }),
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { engaged: { kind: string; contact: string } };
      expect(body.engaged.kind).toBe('voice');
      expect(body.engaged.contact).toBe('Ama Mensah');

      const listed = await app.request('/api/agents', { headers: { 'X-Api-Key': 'waha' } });
      const agentsPayload = (await listed.json()) as { agents: Array<{ engaged: { kind: string } | null }> };
      expect(agentsPayload.agents.find((row) => row.engaged)?.engaged?.kind).toBe('voice');

      const snapshot = await app.request('/api/agents/activity', { headers: { 'X-Api-Key': 'waha' } });
      const activity = (await snapshot.json()) as { engagements: Array<{ agentId: string }> };
      expect(activity.engagements).toHaveLength(1);
      expect(activity.engagements[0].agentId).toBe(agent.id);

      // The route stores engagement on the shared service singleton, not the
      // fresh instance this test built — assert against the one it used, and
      // clear it so nothing leaks between test files sharing the process.
      expect(agentService.listEngagements()).toHaveLength(1);
      agentService.reportActivity(agent.id, { kind: 'voice', active: false });
    } finally {
      store.close();
      if (previousKey === undefined) delete process.env.WAHA_API_KEY;
      else process.env.WAHA_API_KEY = previousKey;
    }
  });

  test('activity stream requires a one-time ticket', async () => {
    const app = new Hono();
    app.route('/api/agent-activity', createAgentsActivityStreamRouter());
    const refused = await app.request('/api/agent-activity/stream');
    expect(refused.status).toBe(401);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toContain('ticket');
  });
});

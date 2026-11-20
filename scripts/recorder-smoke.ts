/**
 * Live drill: drive the runtime recorder against the running BunWa server and
 * verify real rows land in conversations, messages and events — the S2
 * acceptance bar, proven without a phone.
 *
 *   bun run scripts/recorder-smoke.ts
 */
import { RuntimeRecorder } from '../src/core/agent/runtime-recorder';

const env: Record<string, string> = {};
const raw = require('fs').readFileSync('/tmp/bunwa-server.env', 'binary').split('\0');
for (const item of raw) {
  if (!item.includes('=')) continue;
  const i = item.indexOf('=');
  env[item.slice(0, i)] = item.slice(i + 1);
}
const BASE = 'http://127.0.0.1:3001';
const KEY = env.WAHA_API_KEY; // legacy spelling on purpose: the alias must map it.

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

async function main() {
  // 1. Fresh agent for the drill.
  const { agent } = await api('/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name: 'Recorder Drill Agent', prompt: 'drill' }),
  });

  try {
    // 2. Simulate exactly what call-live.ts / fish-bridge.ts now do.
    const recorder = new RuntimeRecorder({
      baseUrl: BASE,
      apiKey: KEY,
      agentId: agent.id,
      contact: '233200000000@s.whatsapp.net',
    });
    const conversationId = await recorder.begin({ kind: 'voice', provider: 'gemini' });
    if (!conversationId) throw new Error('recorder.begin returned null');

    await recorder.caller('Hello, is this Vivita store?');
    await new Promise((r) => setTimeout(r, 250));
    await recorder.reply('Yes it is! How can I help you today?');
    await recorder.caller('How much is delivery to Accra?');
    await new Promise((r) => setTimeout(r, 200));
    await recorder.reply('Delivery to Accra is fifteen cedis and takes two days.');
    await recorder.end({ outcome: 'resolved' });

    // 3. Verify the rows through the same endpoints the dashboard uses.
    const { conversation } = await api(`/api/agents/conversations/${conversationId}`);
    if (conversation.status !== 'closed') throw new Error(`conversation status ${conversation.status}, expected closed`);

    const { messages } = await api(`/api/agents/conversations/${conversationId}/messages`);
    if (messages.length !== 4) throw new Error(`expected 4 messages, got ${messages.length}`);
    if (messages[0].role !== 'customer' || messages[1].role !== 'agent') {
      throw new Error(`unexpected roles: ${messages.map((m: any) => m.role).join(',')}`);
    }

    const { events } = await api(`/api/agents/events?conversationId=${conversationId}`);
    const types = events.map((e: any) => e.type);
    for (const expected of ['conversation.started', 'message.inbound', 'message.outbound', 'agent.reply']) {
      if (!types.includes(expected)) throw new Error(`missing event ${expected} in [${types.join(',')}]`);
    }
    const reply = events.find((e: any) => e.type === 'agent.reply' && typeof e.data?.firstResponseMs === 'number');
        if (!reply) {
      throw new Error('no agent.reply event carries firstResponseMs');
    }

    // 4. The analytics dashboard must now see the conversation.
    const { conversations } = await api(
      `/api/agents/conversations?agentId=${agent.id}&range=24h`,
    );
    if (!conversations.some((c: any) => c.id === conversationId)) {
      throw new Error('dashboard conversation list does not include the recorded call');
    }

    console.log('DRILL PASS');
    console.log('  conversation:', conversationId, 'status:', conversation.status);
    console.log('  messages:', messages.map((m: any) => `${m.role}: ${String(m.text).slice(0, 30)}`).join(' | '));
    console.log('  events:', types.join(', '));
    console.log('  firstResponseMs:', reply.data.firstResponseMs);
  } finally {
    await api(`/api/agents/${agent.id}`, { method: 'DELETE' });
    console.log('drill agent cleaned up');
  }
}

main().catch((error) => {
  console.error('DRILL FAIL:', error instanceof Error ? error.message : error);
  process.exit(1);
});

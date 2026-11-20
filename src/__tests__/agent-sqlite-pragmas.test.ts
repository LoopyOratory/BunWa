import { describe, expect, test, afterAll } from 'bun:test';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { BunSqliteClient, SqlAgentStore } from '../core/agent/agent.sql';

const dir = mkdtempSync(join(tmpdir(), 'bunwa-pragmas-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeFileStore(): SqlAgentStore {
  const path = join(dir, `agent-${Math.random().toString(36).slice(2)}.sqlite`);
  return new SqlAgentStore(new BunSqliteClient(new Database(path)));
}

describe('agent SQLite store pragmas', () => {
  test('opens in WAL mode with a busy timeout and foreign keys ON', async () => {
    const store = makeFileStore();
    await store.init();

    const journal = (await (store as any).client.query<{ journal_mode: string }>('PRAGMA journal_mode'))[0];
    const busy = (await (store as any).client.query<{ timeout: number }>('PRAGMA busy_timeout'))[0];
    const fk = (await (store as any).client.query<{ foreign_keys: number }>('PRAGMA foreign_keys'))[0];

    expect(journal.journal_mode.toLowerCase()).toBe('wal');
    expect(busy.timeout).toBe(5000);
    expect(fk.foreign_keys).toBe(1);
  });

  test('foreign keys are enforced on fresh databases', async () => {
    const store = makeFileStore();
    await store.init();

    // A conversation whose agent does not exist must be refused, not silently
    // stored as an orphan the analytics queries can never join.
    await expect(
      (store as any).client.execute(
        `INSERT INTO bunwa_conversations (id, agent_id, channel, status, metadata, started_at)
         VALUES ('conv-ghost', 'agent-that-never-existed', 'whatsapp', 'open', '{}', ?)`,
        [new Date().toISOString()],
      ),
    ).rejects.toThrow(/FOREIGN KEY|foreign key|constraint/i);
  });

  test('deleting an agent cascades conversations and messages on fresh databases', async () => {
    const store = makeFileStore();
    await store.init();

    const agent = await store.createAgent({
      name: 'Pragmas Probe',
      prompt: '',
      settings: {},
    } as any);
    const conversation = await store.createConversation({
      agentId: agent.id,
      userId: 'user-pragmas',
      channel: 'whatsapp',
    } as any);
    await store.addConversationMessage({
      conversationId: conversation.id,
      agentId: agent.id,
      userId: 'user-pragmas',
      role: 'customer',
      channel: 'whatsapp',
      text: 'hello from the pragma probe',
      metadata: {},
    } as any);

    const deleted = await store.deleteAgent(agent.id);
    expect(deleted).toBe(true);

    const conversations = await (store as any).client.query(
      'SELECT id FROM bunwa_conversations WHERE agent_id = ?',
      [agent.id],
    );
    const messages = await (store as any).client.query(
      'SELECT id FROM bunwa_conversation_messages WHERE agent_id = ?',
      [agent.id],
    );
    expect(conversations).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });
});

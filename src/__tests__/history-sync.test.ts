import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { HistorySyncTracker, type HistorySyncStatus } from '../core/engines/noweb/store/HistorySyncTracker';

const file = () => join(mkdtempSync(join(tmpdir(), 'bunwa-sync-')), 'history-sync.json');

describe('HistorySyncTracker', () => {
  it('starts idle and counts batches', () => {
    const events: HistorySyncStatus[] = [];
    const t = new HistorySyncTracker({ file: null, onChange: (s) => events.push(s), idleMs: 60_000 });
    expect(t.status().state).toBe('idle');
    t.record({ messages: 10, chats: 2, contacts: 5, progress: 30, syncType: 2 });
    t.record({ messages: 4, chats: 1, contacts: 0, progress: 60 });
    const s = t.status();
    expect(s.state).toBe('syncing');
    expect([s.batches, s.messages, s.chats, s.contacts, s.progress]).toEqual([2, 14, 3, 5, 60]);
    expect(events.length).toBe(1); // throttled: first batch only
    t.dispose();
  });

  it('completes on progress 100 and always emits it', () => {
    const events: HistorySyncStatus[] = [];
    const t = new HistorySyncTracker({ file: null, onChange: (s) => events.push(s) });
    t.record({ messages: 1, chats: 1, contacts: 1, progress: 50 });
    t.record({ messages: 1, chats: 0, contacts: 0, progress: 100 });
    expect(t.status().state).toBe('complete');
    expect(t.status().completedAt).not.toBeNull();
    expect(events.at(-1)!.state).toBe('complete');
    t.dispose();
  });

  it('completes after the idle window with no final marker', async () => {
    const t = new HistorySyncTracker({ file: null, onChange: () => {}, idleMs: 30 });
    t.record({ messages: 1, chats: 1, contacts: 0 });
    await Bun.sleep(80);
    expect(t.status().state).toBe('complete');
    t.dispose();
  });

  it('persists and reloads', async () => {
    const f = file();
    const a = new HistorySyncTracker({ file: f, onChange: () => {} });
    a.record({ messages: 7, chats: 1, contacts: 2, progress: 100 });
    await Bun.sleep(20);
    a.dispose();
    const b = new HistorySyncTracker({ file: f, onChange: () => {} });
    await b.load();
    expect(b.status().messages).toBe(7);
    expect(b.status().state).toBe('complete');
    b.dispose();
  });

  it('a new batch after completion starts a new sync', () => {
    const t = new HistorySyncTracker({ file: null, onChange: () => {} });
    t.record({ messages: 1, chats: 0, contacts: 0, progress: 100 });
    t.record({ messages: 2, chats: 0, contacts: 0, progress: 10 });
    expect(t.status().state).toBe('syncing');
    expect(t.status().messages).toBe(2);
    t.dispose();
  });
});

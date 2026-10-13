import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { sessionTools } from '../mcp/tools/session.tools';
import { emptyHistorySyncStatus } from '../core/engines/noweb/store/HistorySyncTracker';

const status = { ...emptyHistorySyncStatus('syncing'), batches: 3, messages: 120, progress: 42 };
const manager: any = { getWorkingSession: async () => ({ getHistorySyncStatus: () => status }) };

describe('SessionSyncStatus', () => {
  it('returns the tracker status', async () => {
    const tool = sessionTools(manager).find((t) => t.name === 'SessionSyncStatus')!;
    expect(tool.tier).toBe('read');
    expect(tool.sessionScoped).toBe(true);
    expect(await tool.handler({ sessionId: 'vivita' })).toEqual(status);
  });
});

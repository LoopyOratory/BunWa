import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { buildAllTools } from '../mcp/tools';
import type { SessionManager } from '../core/manager.core';

/**
 * Session-scoped MCP keys.
 *
 * A client configured with a session key should not have to name its session:
 * the key already says which one it is. That was broken, because every tool
 * declared `sessionId` as required and the MCP SDK validates input before the
 * server can inject the scoped session, so a keyed call with no arguments came
 * back as "Input validation error: expected string". The field is now optional
 * with a default, the server fills it from the key, and these tests pin both
 * halves: the schema must accept the call, and the default must be an empty
 * string the server can recognise and replace.
 */

const fakeManager = {
  getWorkingSession: async () => ({}),
  exists: async () => true,
} as unknown as SessionManager;

describe('session-scoped MCP tools', () => {
  const tools = buildAllTools(fakeManager);
  const scoped = tools.filter((tool) => tool.sessionScoped);

  it('exist in every family and are the majority', () => {
    expect(scoped.length).toBeGreaterThan(70);
    expect(tools.filter((tool) => !tool.sessionScoped).map((tool) => tool.name)).toEqual([
      'SessionList',
    ]);
  });

  it('accept a call that does not name a session', () => {
    for (const tool of scoped) {
      const parsed = tool.inputSchema.safeParse({});
      if (!parsed.success) {
        // Some tools legitimately need other fields (chatId, text). The point
        // here is only that sessionId is not one of them.
        const missing = parsed.error.issues.map((issue) => issue.path.join('.'));
        expect(missing, tool.name).not.toContain('sessionId');
      } else {
        expect((parsed.data as any).sessionId, tool.name).toBe('');
      }
    }
  });

  it('advertise sessionId as optional so a client knows it can omit it', () => {
    for (const tool of scoped) {
      const shape = (tool.inputSchema as any).shape;
      expect(shape?.sessionId?.isOptional(), tool.name).toBe(true);
    }
  });

  it('still accept a named session, which the server overrides for a keyed call', () => {
    const groupList = tools.find((tool) => tool.name === 'GroupList')!;
    expect((groupList.inputSchema.parse({ sessionId: 'loopy' }) as any).sessionId).toBe('loopy');
  });

  it('leave the global tool without a session', () => {
    const sessionList = tools.find((tool) => tool.name === 'SessionList')!;
    expect(sessionList.sessionScoped).toBeFalsy();
  });
});

import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { contactTools } from '../mcp/tools/contact.tools';
import { chatTools } from '../mcp/tools/chat.tools';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * Pagination on the read tools.
 *
 * The MCP had no way to list contacts at all, and ChatGetMessages defaulted to
 * a 50-message page with a 500 ceiling, so an agent could not reach a full
 * history or a full contact book. ContactList mirrors GET /api/contacts/all and
 * the message page now goes to 1000 with offset paging spelled out.
 */

const calls: { method: string; args: any[] }[] = [];
const session = {
  getContacts: async (pagination: any) => {
    calls.push({ method: 'getContacts', args: [pagination] });
    return [{ id: '15551234567@c.us' }];
  },
  getChatMessages: async (chatId: string, query: any) => {
    calls.push({ method: 'getChatMessages', args: [chatId, query] });
    return [];
  },
};
const manager = { getWorkingSession: async () => session } as unknown as SessionManager;

const tool = (tools: ToolDescriptor[], name: string) => tools.find((t) => t.name === name)!;

describe('contact listing', () => {
  const tools = contactTools(manager);

  it('exposes a ContactList tool', () => {
    const t = tool(tools, 'ContactList');
    expect(t.category).toBe('contact');
    expect(t.sessionScoped).toBe(true);
    expect(t.tier).toBe('read');
  });

  it('passes no limit through, so the whole book comes back', async () => {
    calls.length = 0;
    await tool(tools, 'ContactList').handler({ sessionId: 's' } as never);
    expect(calls).toEqual([{ method: 'getContacts', args: [{ limit: undefined, offset: undefined }] }]);
  });

  it('passes a limit and offset for paging', async () => {
    calls.length = 0;
    await tool(tools, 'ContactList').handler({ sessionId: 's', limit: 100, offset: 200 } as never);
    expect(calls).toEqual([{ method: 'getContacts', args: [{ limit: 100, offset: 200 }] }]);
  });

  it('rejects an absurd limit', () => {
    expect(() => tool(tools, 'ContactList').inputSchema.parse({ sessionId: 's', limit: 5000 })).toThrow();
  });
});

describe('message paging', () => {
  const tools = chatTools(manager);

  it('accepts a page of up to 1000', () => {
    const parsed: any = tool(tools, 'ChatGetMessages').inputSchema.parse({
      sessionId: 's',
      chatId: 'c',
      limit: 1000,
      offset: 50,
    });
    expect(parsed.limit).toBe(1000);
    expect(parsed.offset).toBe(50);
  });

  it('refuses more than a thousand in one call', () => {
    expect(() =>
      tool(tools, 'ChatGetMessages').inputSchema.parse({ sessionId: 's', chatId: 'c', limit: 1001 }),
    ).toThrow();
  });

  it('defaults the page to 50 when no limit is given', async () => {
    calls.length = 0;
    await tool(tools, 'ChatGetMessages').handler({ sessionId: 's', chatId: 'c' } as never);
    const [, query] = calls[0].args;
    expect(query.limit).toBe(50);
    expect(query.offset).toBe(0);
  });
});

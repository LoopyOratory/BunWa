import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { container } from 'tsyringe';
import { SendingPolicyService } from '../core/sending-policy/sending-policy.service';
import { BadRequestException, NotFoundException } from '../core/exceptions';
import { policyTools } from '../mcp/tools/policy.tools';
import { templateTools } from '../mcp/tools/template.tools';
import { ToolRegistryService } from '../mcp/tool-registry.service';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * The sending-policy MCP tools: contract (tiers/scoping/destructive gate),
 * behavior of Get/Set/Usage against a real SendingPolicyService on a temp
 * SQLite file, and registry coexistence with the template tools.
 */

const fakeManager = {
  exists: async (name: string) => name === 'default',
} as unknown as SessionManager;

function tool(tools: ToolDescriptor[], name: string): ToolDescriptor {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`Tool ${name} not found`);
  return found;
}

/** Run input through the same zod validation the MCP adapter applies. */
async function call<T = any>(descriptor: ToolDescriptor, input: unknown): Promise<T> {
  const parsed = descriptor.inputSchema.parse(input);
  return (await descriptor.handler(parsed as never)) as T;
}

describe('sending-policy MCP tools', () => {
  let policy: SendingPolicyService;
  let tools: ToolDescriptor[];

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'bunwa-policy-tools-'));
    policy = new SendingPolicyService(dir);
    container.registerInstance(SendingPolicyService, policy);
    tools = policyTools(fakeManager);
  });

  afterEach(() => {
    policy.destroy();
  });

  it('declares the expected contract', () => {
    expect(tools.map((t) => t.name)).toEqual([
      'SendingPolicyGet',
      'SendingPolicySet',
      'SendingPolicyUsage',
    ]);
    for (const t of tools) {
      expect(t.sessionScoped).toBe(true);
      expect(t.category).toBe('policy');
    }
    expect(tool(tools, 'SendingPolicyGet').tier).toBe('read');
    expect(tool(tools, 'SendingPolicyUsage').tier).toBe('read');
    const set = tool(tools, 'SendingPolicySet');
    expect(set.tier).toBe('write');
    // Weakening anti-ban limits rides the destructive gate by design.
    expect(set.destructive).toBe(true);
  });

  it('SendingPolicyGet returns bypassed, overrides and usage', async () => {
    const result = await call(tool(tools, 'SendingPolicyGet'), { sessionId: 'default' });
    expect(result.session).toBe('default');
    expect(result.bypassed).toBe(false);
    expect(result.overrides).toEqual({});
    expect(result.usage.counts.lastMinute).toBe(0);
    expect(result.usage.effective.maxPerMinute).toBeGreaterThan(0);
  });

  it('SendingPolicySet replaces overrides wholesale and clears with none', async () => {
    const set = tool(tools, 'SendingPolicySet');
    const first = await call(set, { sessionId: 'default', maxPerMinute: 3, quietHours: '' });
    expect(first.overrides).toEqual({ maxPerMinute: 3, quietHours: '' });

    const second = await call(set, { sessionId: 'default', maxPerDay: 50 });
    expect(second.overrides).toEqual({ maxPerDay: 50 });

    const cleared = await call(set, { sessionId: 'default' });
    expect(cleared.overrides).toEqual({});
    expect(policy.getOverrides('default')).toEqual({});
  });

  it('SendingPolicySet rejects malformed input', async () => {
    const set = tool(tools, 'SendingPolicySet');
    await expect(call(set, { sessionId: 'default', maxPerMinute: -1 })).rejects.toThrow();
    await expect(
      call(set, { sessionId: 'default', quietHours: '99:99-88:88' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('SendingPolicyUsage reflects recorded sends', async () => {
    policy.recordSend('default', '123@c.us');
    const usage = await call(tool(tools, 'SendingPolicyUsage'), { sessionId: 'default' });
    expect(usage.counts.lastMinute).toBe(1);
    expect(usage.bypassed).toBe(false);
  });

  it('rejects unknown sessions with NotFoundException', async () => {
    await expect(
      call(tool(tools, 'SendingPolicyGet'), { sessionId: 'missing' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('registers next to the template tools without collisions', () => {
    const all = [...tools, ...templateTools(fakeManager)];
    expect(all).toHaveLength(10);
    expect(() => new ToolRegistryService(all)).not.toThrow();
  });
});

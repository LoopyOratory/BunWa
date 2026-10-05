import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { container } from 'tsyringe';
import { AuditService, AuditAction } from '../core/audit/audit.service';
import { auditToolCall, isToolAllowed } from '../mcp/mcp.server';
import { ToolRegistryService } from '../mcp/tool-registry.service';
import { buildAllTools } from '../mcp/tools';
import { sessionTools } from '../mcp/tools/session.tools';
import { redactSessionSecrets } from '../core/api-keys/rest-api-keys';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * MCP security posture.
 *
 * The REST routes audit every send through `sendAndAudit`; the MCP path called
 * the engine methods directly, so an agent could send messages, change a group
 * or delete a status with no trace in the audit log. These tests pin the audit
 * trail, the secret redaction on session reads, and the read-only filter.
 */

let audit: AuditService;

function toolNamed(name: string): ToolDescriptor {
  const tool = buildAllTools({} as SessionManager).find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} missing`);
  return tool;
}

describe('MCP auditing', () => {
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'bunwa-audit-'));
    container.registerInstance(AuditService, new AuditService(dir));
    audit = container.resolve(AuditService);
  });

  it('records a write tool call with the tool, session and credential', async () => {
    auditToolCall(toolNamed('MessageSendText'), { sessionId: 'vivita' }, 'session-key', 'ok');

    const { data: entries } = await audit.findAll({ limit: 10 });
    const entry = entries.find((e) => e.action === AuditAction.MCP_TOOL_CALLED);
    expect(entry).toBeDefined();
    expect(entry!.sessionName).toBe('vivita');
    // metadata is stored as a JSON string column
    const metadata = JSON.parse(entry!.metadata ?? '{}');
    expect(metadata.tool).toBe('MessageSendText');
    expect(metadata.credential).toBe('session-key');
    expect(metadata.source).toBe('mcp');
  });

  it('records a failed write with its error', async () => {
    auditToolCall(
      toolNamed('GroupLeave'),
      { sessionId: 'vivita' },
      'global-key',
      'failed',
      new Error('not allowed'),
    );

    const { data: entries } = await audit.findAll({ limit: 10 });
    const entry = entries.find((e) => e.action === AuditAction.MCP_TOOL_FAILED);
    expect(entry).toBeDefined();
    expect(entry!.errorMessage).toContain('not allowed');
    expect(JSON.parse(entry!.metadata ?? '{}').destructive).toBe(true);
  });

  it('does not audit reads, matching the REST behaviour', async () => {
    auditToolCall(toolNamed('GroupList'), { sessionId: 'vivita' }, 'session-key', 'ok');
    const { data: entries } = await audit.findAll({ limit: 10 });
    expect(entries.filter((e) => e.action === AuditAction.MCP_TOOL_CALLED)).toEqual([]);
  });

  it('never throws when auditing is unavailable', () => {
    container.registerInstance(AuditService, undefined as any);
    expect(() =>
      auditToolCall(toolNamed('MessageSendText'), { sessionId: 'x' }, 'global-key', 'ok'),
    ).not.toThrow();
  });
});

describe('MCP secret redaction', () => {
  it('SessionGet does not return key hashes', async () => {
    const manager = {
      getSession: () => ({
        status: 'WORKING',
        sessionConfig: {
          engine: 'NOWEB',
          mcp: { enabled: true, destructiveOps: false, apiKeyHash: 'deadbeef' },
          restApiKeys: [{ id: '1', name: 'k', keyHash: 'cafebabe' }],
        },
        getSessionMeInfo: () => null,
      }),
    } as unknown as SessionManager;

    const sessionGet = sessionTools(manager).find((t) => t.name === 'SessionGet')!;
    const result: any = await sessionGet.handler({ sessionId: 'vivita' } as never);

    expect(result.config.mcp.apiKeyHash).toBeUndefined();
    expect(result.config.restApiKeys).toBeUndefined();
    // the rest of the config still travels
    expect(result.config.engine).toBe('NOWEB');
    expect(result.config.mcp.enabled).toBe(true);
  });

  it('the redaction helper drops both hashes and keeps everything else', () => {
    const redacted = redactSessionSecrets({
      engine: 'NOWEB',
      metadata: { shop: 'test' },
      mcp: { enabled: true, destructiveOps: true, apiKeyHash: 'x' },
      restApiKeys: [{ id: '1' }],
    } as any);
    expect((redacted as any).mcp.apiKeyHash).toBeUndefined();
    expect((redacted as any).restApiKeys).toBeUndefined();
    expect((redacted as any).mcp.destructiveOps).toBe(true);
    expect((redacted as any).metadata).toEqual({ shop: 'test' });
  });
});

describe('MCP read-only mode and the destructive gate', () => {
  const tools = buildAllTools({} as SessionManager);

  it('read-only mode keeps only read-tier tools', () => {
    const registry = new ToolRegistryService(tools);
    const listed = registry.list({ readOnly: true });
    expect(listed.length).toBeGreaterThan(20);
    expect(listed.every((t) => t.tier === 'read')).toBe(true);
    // the media and group families follow the same rule
    expect(listed.some((t) => t.name === 'MediaDownloadMessage')).toBe(true);
    expect(listed.some((t) => t.name === 'MediaConvertVoice')).toBe(false);
    expect(listed.some((t) => t.name === 'GroupCreate')).toBe(false);
  });

  it('every destructive tool needs destructiveOps', () => {
    for (const tool of tools.filter((t) => t.destructive)) {
      const denied = isToolAllowed(tool, { enabled: true, destructiveOps: false } as any);
      expect(denied.allowed, tool.name).toBe(false);
      const allowed = isToolAllowed(tool, { enabled: true, destructiveOps: true } as any);
      expect(allowed.allowed, tool.name).toBe(true);
    }
  });

  it('a deny list can shut a whole category', () => {
    const denied = isToolAllowed(toolNamed('MediaDownloadMessage'), {
      enabled: true,
      deniedTools: ['media'],
    } as any);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('Category');
  });
});

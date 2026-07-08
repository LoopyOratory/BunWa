import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { validateApiKey, isToolAllowed } from '../mcp/mcp.server';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

describe('validateApiKey (timing-safe comparison)', () => {
  it('returns true when no key is configured (dev mode)', () => {
    expect(validateApiKey('anything', undefined)).toBe(true);
    expect(validateApiKey('', undefined)).toBe(true);
    expect(validateApiKey(undefined, undefined)).toBe(true);
  });

  it('returns false when key is configured but not provided', () => {
    expect(validateApiKey(undefined, 'secret-key')).toBe(false);
    expect(validateApiKey('', 'secret-key')).toBe(false);
  });

  it('returns true when provided key matches configured key', () => {
    expect(validateApiKey('secret-key', 'secret-key')).toBe(true);
  });

  it('returns false when provided key does not match configured key', () => {
    expect(validateApiKey('wrong-key', 'secret-key')).toBe(false);
  });

  it('returns false when key is similar but not identical', () => {
    expect(validateApiKey('secret-keY', 'secret-key')).toBe(false);
    expect(validateApiKey('secret-key ', 'secret-key')).toBe(false);
    expect(validateApiKey('secret-keyx', 'secret-key')).toBe(false);
  });
});

describe('isToolAllowed (permission checks)', () => {
  const mockTool: ToolDescriptor = {
    name: 'SendText',
    description: 'Send a text message',
    tier: 'write',
    inputSchema: {} as any,
    sessionScoped: true,
    category: 'message',
    handler: async () => ({}),
  };

  const destructiveTool: ToolDescriptor = {
    ...mockTool,
    name: 'DeleteMessage',
    destructive: true,
  };

  it('allows tool when no MCP config is set', () => {
    const result = isToolAllowed(mockTool, undefined);
    expect(result.allowed).toBe(true);
  });

  it('denies tool when MCP is disabled', () => {
    const result = isToolAllowed(mockTool, { enabled: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('denies tool when in denied list', () => {
    const result = isToolAllowed(mockTool, { deniedTools: ['SendText'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('denied');
  });

  it('denies tool when in denied category', () => {
    const result = isToolAllowed(mockTool, { deniedTools: ['message'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('denied');
  });

  it('denies destructive tool when destructiveOps is not enabled', () => {
    const result = isToolAllowed(destructiveTool, {});
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not allowed');
  });

  it('allows destructive tool when destructiveOps is enabled', () => {
    const result = isToolAllowed(destructiveTool, { destructiveOps: true });
    expect(result.allowed).toBe(true);
  });

  it('allows tool in allowed list when allow list mode is active', () => {
    const result = isToolAllowed(mockTool, { allowedTools: ['SendText'] });
    expect(result.allowed).toBe(true);
  });

  it('denies tool not in allowed list when allow list mode is active', () => {
    const result = isToolAllowed(mockTool, { allowedTools: ['OtherTool'] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in the allowed list');
  });

  it('allows tool in allowed category when allow list mode is active', () => {
    const result = isToolAllowed(mockTool, { allowedTools: ['message'] });
    expect(result.allowed).toBe(true);
  });
});

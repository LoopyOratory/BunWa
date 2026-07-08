import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { createMcpRouter } from '../mcp/mcp.server';

/**
 * Parse an SSE response body into one or more JSON-RPC payloads.
 * The Streamable-HTTP transport returns:
 *   event: message
 *   data: <json>
 */
function parseSse(body: string): object[] {
  const results: object[] = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('data: ')) {
      results.push(JSON.parse(line.slice(6)));
    }
  }
  return results;
}

describe('MCP endpoint (Streamable-HTTP JSON-RPC)', () => {
  let app: Hono;
  let savedKey: string | undefined;

  beforeAll(() => {
    configureContainer();
    const sessionManager = container.resolve(SessionManager);

    // Build the same router main.ts uses, but don't require an API key so
    // tests 1–3 pass without auth. Test 4 sets a key and rebuilds.
    savedKey = process.env.WAHA_API_KEY;
    delete process.env.WAHA_API_KEY;

    const router = createMcpRouter(sessionManager);
    app = new Hono();
    app.route('/', router);
  });

  afterAll(() => {
    if (savedKey !== undefined) {
      process.env.WAHA_API_KEY = savedKey;
    }
  });

  // Helper — POST a JSON-RPC request to /mcp, return parsed payloads
  async function postMcp(body: object, extraHeaders?: Record<string, string>): Promise<object[]> {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    return parseSse(await res.text());
  }

  describe('protocol — initialize', () => {
    it('returns server info on initialize', async () => {
      const payloads = await postMcp({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      });

      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const result = payloads[0] as any;
      expect(result.id).toBe(1);
      expect(result.result.serverInfo.name).toBe('waha-bun');
      expect(result.result.protocolVersion).toBe('2025-11-25');
    });
  });

  describe('protocol — tools/list', () => {
    it('returns the registered tool list', async () => {
      const payloads = await postMcp(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        },
        { 'Mcp-Protocol-Version': '2025-11-25' },
      );

      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const result = payloads[0] as any;
      expect(result.id).toBe(2);
      expect(Array.isArray(result.result.tools)).toBe(true);

      // Known tool from src/mcp/tools/session.tools.ts
      const toolNames: string[] = result.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('SessionList');
      expect(toolNames).toContain('SessionGet');
    });
  });

  describe('protocol — tools/call', () => {
    it('calls SessionList and receives a content array', async () => {
      const payloads = await postMcp(
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'SessionList',
            arguments: {},
          },
        },
        { 'Mcp-Protocol-Version': '2025-11-25' },
      );

      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const result = payloads[0] as any;
      expect(result.id).toBe(3);
      // The handler returns an array (session list) — it should be in content
      expect(result.result).toBeDefined();
      expect(result.result.content).toBeDefined();
      expect(Array.isArray(result.result.content)).toBe(true);

      // The content should be a valid JSON-serialised array in text items
      const textItems = result.result.content.filter(
        (item: any) => item.type === 'text',
      );
      expect(textItems.length).toBeGreaterThan(0);
      const parsed = JSON.parse(textItems[0].text);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe('auth', () => {
    it('rejects tools/call when WAHA_API_KEY is set and not provided', async () => {
      const oldKey = process.env.WAHA_API_KEY;

      // Set a test key and rebuild the router so it reads the key at mount time
      process.env.WAHA_API_KEY = 'test-secret-key';
      try {
        const sessionManager = container.resolve(SessionManager);
        const authApp = new Hono();
        authApp.route('/', createMcpRouter(sessionManager));

        const res = await authApp.request('/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Mcp-Protocol-Version': '2025-11-25',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'SessionList', arguments: {} },
          }),
        });

        // The transport may return 200 with the error in the SSE body
        // (tool handler yields a JSON-RPC error) or it may return a
        // non-200 HTTP status. Either outcome proves auth is enforced.
        const body = await res.text();
        const hasUnauthorized =
          res.status !== 200 ||
          body.includes('Unauthorized') ||
          body.includes('Invalid or missing API key');
        expect(hasUnauthorized).toBe(true);
      } finally {
        process.env.WAHA_API_KEY = oldKey;
      }
    });
  });
});

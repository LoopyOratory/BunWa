/**
 * MCP Server for WAHA-Bun.
 *
 * Uses WebStandardStreamableHTTPServerTransport (native Web Standard APIs)
 * which works directly with Bun's fetch-based HTTP server and Hono framework.
 *
 * Pattern: stateless, new McpServer per request — no session map, no GET/DELETE reconnect.
 * Tool registration is O(n) pure function calls with no I/O overhead.
 */
import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import pino from 'pino';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from './tool-descriptor';
import { ToolRegistryService } from './tool-registry.service';
import { handleToolError, jsonToolResult, smartToolResult } from './tool-result';
import { KeyRateLimiter, RateLimitError, readRateLimitConfig } from './mcp-rate-limit';
import { sessionTools } from './tools/session.tools';
import { messageTools } from './tools/message.tools';
import { contactTools } from './tools/contact.tools';

const logger = pino({ name: 'McpServer' });

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/** Extract API key from MCP request headers. Accepts X-Api-Key or Bearer token. */
function extractApiKey(extra: ToolExtra): string | undefined {
  const headers = extra.requestInfo?.headers ?? {};
  const xApiKey = headers['x-api-key'];
  if (xApiKey) {
    return Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
  }
  const auth = headers['authorization'];
  const authStr = Array.isArray(auth) ? auth[0] : auth;
  if (authStr?.toLowerCase().startsWith('bearer ')) {
    return authStr.slice(7).trim();
  }
  return undefined;
}

/** Simple API key validation against the configured key. */
function validateApiKey(rawKey: string | undefined, configuredKey: string | undefined): boolean {
  if (!configuredKey) return true; // No key configured = open access (dev mode)
  if (!rawKey) return false;
  return rawKey === configuredKey;
}

/**
 * Build the MCP server and register all tools from the registry.
 */
function buildServer(
  registry: ToolRegistryService,
  configuredKey: string | undefined,
  rateLimiter: KeyRateLimiter,
  readOnly: boolean,
  serverInfo: { name: string; version: string },
): McpServer {
  const server = new McpServer(
    { name: serverInfo.name, version: serverInfo.version },
    { capabilities: { tools: {}, logging: {} } },
  );

  const tools = registry.list({ readOnly });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema as Parameters<typeof server.registerTool>[1]['inputSchema'],
        annotations: {
          readOnlyHint: tool.tier === 'read',
          destructiveHint: tool.destructive ?? false,
          idempotentHint: tool.idempotent ?? tool.tier === 'read',
        },
      },
      async (input: Record<string, unknown>, extra: ToolExtra) => {
        const rawKey = extractApiKey(extra);
        try {
          if (!validateApiKey(rawKey, configuredKey)) {
            return jsonToolResult(
              { success: false, name: 'Unauthorized', message: 'Invalid or missing API key' },
              true,
            );
          }
          rateLimiter.check(rawKey || 'anonymous');
          const result = await tool.handler(input as never);
          return tool.resultDisposition === 'json'
            ? jsonToolResult(result as object)
            : smartToolResult(result as object);
        } catch (error) {
          return handleToolError(error);
        }
      },
    );
  }

  logger.info(`MCP server built with ${tools.length} tools (readOnly=${readOnly})`);
  return server;
}

export interface MountMcpServerOptions {
  basePath?: string;
  serverInfo?: { name: string; version: string };
  readOnly?: boolean;
}

/**
 * Create a Hono router for the MCP endpoint.
 *
 * Mounts at `basePath` (default `/mcp`) as a POST handler.
 * Uses WebStandardStreamableHTTPServerTransport which natively accepts
 * a Web Standard Request and returns a Response — perfect for Bun/Hono.
 *
 * Per request: mint a fresh McpServer + transport, handle, tear down.
 * Stateless (sessionIdGenerator: undefined) — no session map.
 */
export function createMcpRouter(
  sessionManager: SessionManager,
  options: MountMcpServerOptions = {},
): Hono {
  const router = new Hono();

  const basePath = (options.basePath ?? '/mcp').replace(/\/$/, '') || '/mcp';
  const serverInfo = options.serverInfo ?? { name: 'waha-bun', version: '1.0.0' };
  const readOnly = options.readOnly ?? process.env.MCP_READONLY === 'true';
  const configuredKey = process.env.WAHA_API_KEY || undefined;

  // Build tool registry from all tool definition factories
  const allTools: ToolDescriptor[] = [
    ...sessionTools(sessionManager),
    ...messageTools(sessionManager),
    ...contactTools(sessionManager),
  ];
  const registry = new ToolRegistryService(allTools);

  // Eagerly compute tool list at mount time to validate registry
  const tools = registry.list({ readOnly });
  logger.info(`MCP router mounted at POST ${basePath} (${tools.length} tools)`);

  // Set up rate limiter
  const { max, windowMs } = readRateLimitConfig();
  const rateLimiter = new KeyRateLimiter(max, windowMs);

  // Handle all HTTP methods — the transport decides what to do
  router.all(basePath, async (c) => {
    const server = buildServer(registry, configuredKey, rateLimiter, readOnly, serverInfo);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    try {
      await server.connect(transport);

      // Hono's c.req.raw is a native Web Standard Request
      const response = await transport.handleRequest(c.req.raw);

      // Clean up after the request completes
      try {
        await transport.close();
        await server.close();
      } catch {
        // Ignore cleanup errors
      }

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Error handling MCP request');
      try {
        await transport.close();
        await server.close();
      } catch {
        // Ignore cleanup errors
      }

      if (error instanceof RateLimitError) {
        return c.json(
          { jsonrpc: '2.0', error: { code: -32603, message: error.message }, id: null },
          429,
        );
      }
      return c.json(
        { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null },
        500,
      );
    }
  });

  return router;
}

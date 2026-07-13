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
import { timingSafeEqual, createHash } from 'crypto';
import type { SessionManager } from '../core/manager.core';
import type { SessionConfig } from '../structures/sessions.dto';
import type { ToolDescriptor } from './tool-descriptor';
import { ToolRegistryService } from './tool-registry.service';
import { handleToolError, jsonToolResult, smartToolResult } from './tool-result';
import { KeyRateLimiter, RateLimitError, readRateLimitConfig } from './mcp-rate-limit';
import { sessionTools } from './tools/session.tools';
import { messageTools } from './tools/message.tools';
import { contactTools } from './tools/contact.tools';
import { chatTools } from './tools/chat.tools';
import { statusTools } from './tools/status.tools';
import { presenceTools } from './tools/presence.tools';

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

/** Timing-safe string comparison. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** API key validation against the configured key using timing-safe comparison. */
export function validateApiKey(rawKey: string | undefined, configuredKey: string | undefined): boolean {
  if (!configuredKey) return true; // No key configured = open access (dev mode)
  if (!rawKey) return false;
  return safeCompare(rawKey, configuredKey);
}

/**
 * Check whether a tool is allowed for the given session configuration.
 * Global disabled tools are checked separately before calling this.
 */
export function isToolAllowed(
  tool: ToolDescriptor,
  mcpConfig: SessionConfig['mcp'] | undefined,
): { allowed: boolean; reason?: string } {
  // MCP disabled for this session
  if (mcpConfig?.enabled === false) {
    return { allowed: false, reason: 'MCP is disabled for this session' };
  }

  // Deny list (explicit deny wins everything)
  if (mcpConfig?.deniedTools) {
    if (mcpConfig.deniedTools.includes(tool.name)) {
      return { allowed: false, reason: `Tool '${tool.name}' is denied for this session` };
    }
    if (tool.category && mcpConfig.deniedTools.includes(tool.category)) {
      return { allowed: false, reason: `Category '${tool.category}' tools are denied for this session` };
    }
  }

  // Destructive operations gate
  if (tool.destructive && mcpConfig?.destructiveOps !== true) {
    return { allowed: false, reason: `Destructive operation '${tool.name}' is not allowed for this session` };
  }

  // Allow list mode — if set, tool must be explicitly allowed
  if (mcpConfig?.allowedTools && mcpConfig.allowedTools.length > 0) {
    if (mcpConfig.allowedTools.includes(tool.name)) {
      return { allowed: true };
    }
    if (tool.category && mcpConfig.allowedTools.includes(tool.category)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Tool '${tool.name}' is not in the allowed list for this session` };
  }

  return { allowed: true };
}

/**
 * Build the MCP server and register all tools from the registry.
 */
function buildServer(
  registry: ToolRegistryService,
  sessionManager: SessionManager,
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
    (server.registerTool as (
      name: string,
      config: { description: string; inputSchema: unknown; annotations: Record<string, unknown> },
      handler: (input: Record<string, unknown>, extra: ToolExtra) => Promise<unknown>,
    ) => void)(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.tier === 'read',
          destructiveHint: tool.destructive ?? false,
          idempotentHint: tool.idempotent ?? tool.tier === 'read',
        },
      },
      async (input: Record<string, unknown>, extra: ToolExtra) => {
        const rawKey = extractApiKey(extra);
        try {
          // Auth: global key first, then per-session hashed keys
          const globalOk = validateApiKey(rawKey, configuredKey);
          let scopedSession: string | undefined;

          if (!globalOk && rawKey) {
            const providedHash = createHash('sha256').update(rawKey).digest('hex');
            const allSessions = await sessionManager.getSessions();
            for (const s of allSessions) {
              try {
                const cfg = sessionManager.getSessionConfig(s.name);
                if (cfg?.mcp?.apiKeyHash && safeCompare(cfg.mcp.apiKeyHash, providedHash)) {
                  scopedSession = s.name;
                  break;
                }
              } catch {
                // Session config not available — skip
              }
            }
          }

          if (!globalOk && !scopedSession) {
            return jsonToolResult(
              { success: false, name: 'Unauthorized', message: 'Invalid or missing API key' },
              true,
            );
          }

          rateLimiter.check(rawKey || 'anonymous');

          // Auto-scoping: per-session key forces sessionId
          if (scopedSession && tool.sessionScoped) {
            input.sessionId = scopedSession;
          }

          // Permission check — resolve session config for session-scoped tools
          if (tool.sessionScoped) {
            const sessionId = input.sessionId as string | undefined;
            if (!sessionId) {
              return jsonToolResult(
                { success: false, name: 'PermissionDenied', message: 'sessionId is required for this tool' },
                true,
              );
            }
            const sessionConfig = sessionManager.getSessionConfig(sessionId);
            const { allowed, reason } = isToolAllowed(tool, sessionConfig?.mcp);
            if (!allowed) {
              return jsonToolResult(
                { success: false, name: 'PermissionDenied', message: reason || 'Tool not allowed' },
                true,
              );
            }
          } else if (scopedSession) {
            // A per-session key must never reach a global/non-session-scoped
            // tool — those aren't bound to any sessionId and would otherwise
            // leak cross-session data (e.g. SessionList) to a key that's only
            // supposed to see its own session.
            return jsonToolResult(
              { success: false, name: 'PermissionDenied', message: `Tool '${tool.name}' is not available to a session-scoped key` },
              true,
            );
          } else {
            // Non-session-scoped tools still check MCP-level disable
            const { allowed, reason } = isToolAllowed(tool, undefined);
            if (!allowed) {
              return jsonToolResult(
                { success: false, name: 'PermissionDenied', message: reason || 'Tool not allowed' },
                true,
              );
            }
          }

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
    ...chatTools(sessionManager),
    ...statusTools(sessionManager),
    ...presenceTools(sessionManager),
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
    const server = buildServer(registry, sessionManager, configuredKey, rateLimiter, readOnly, serverInfo);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    try {
      await server.connect(transport);

      // Hono's c.req.raw is a native Web Standard Request
      // The transport manages its own lifecycle and will close the stream
      // naturally after all responses are sent — do NOT close it here.
      return transport.handleRequest(c.req.raw);
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

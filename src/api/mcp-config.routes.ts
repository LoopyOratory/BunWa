/**
 * MCP Config REST API — serves tool registry info and per-session MCP settings
 * to the dashboard UI.
 */
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, CanServer, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { CryptoHasher } from 'bun';
import { randomBytes } from 'crypto';
import { openSecret, sealSecret, secretPrefix } from '../core/security/secret-box';
import { buildAllTools } from '../mcp/tools';
import { ToolRegistryService } from '../mcp/tool-registry.service';
import type { ToolCategory } from '../mcp/tool-descriptor';
import { agentService } from '../core/agent/agent.service';
import type { ExternalMcpServer, ExternalMcpTool } from '../core/agent/agent.types';

export type McpToolInfo = {
  name: string;
  description: string;
  tier: string;
  category?: ToolCategory;
  destructive?: boolean;
  sessionScoped?: boolean;
  serverId?: string;
  serverName?: string;
  remoteName?: string;
};

const MAX_SERVER_NAME = 80;
const MAX_SERVER_URL = 2048;
const MAX_HEADER_COUNT = 50;
const MAX_HEADER_VALUE = 4096;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

function parseServerUrl(raw: unknown): { url: string } | { error: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { error: 'url is required' };
  const value = raw.trim();
  if (value.length > MAX_SERVER_URL) return { error: `url must be ${MAX_SERVER_URL} characters or fewer` };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { error: 'url must be a valid absolute URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'url must use http or https' };
  }
  if (parsed.username || parsed.password) {
    return { error: 'url must not contain credentials; use headers instead' };
  }
  return { url: parsed.toString() };
}

function parseHeaders(raw: unknown): { headers: Record<string, string> } | { error: string } {
  if (raw === undefined || raw === null) return { headers: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'headers must be a JSON object' };
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_HEADER_COUNT) return { error: `headers must contain at most ${MAX_HEADER_COUNT} entries` };

  const headers: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!HEADER_NAME.test(key)) return { error: `invalid header name: ${key}` };
    if (typeof value !== 'string') return { error: `header ${key} must be a string` };
    if (value.length > MAX_HEADER_VALUE) return { error: `header ${key} is too long` };
    if (/[\r\n]/.test(value)) return { error: `header ${key} must not contain newlines` };
    headers[key] = value;
  }
  return { headers };
}

/** Never return stored credentials to the browser. */
function publicExternalMcpServer(server: ExternalMcpServer) {
  const { headers, ...rest } = server;
  return { ...rest, headerNames: Object.keys(headers).sort() };
}

function publicExternalMcpTool(tool: ExternalMcpTool) {
  return {
    id: tool.id,
    serverId: tool.serverId,
    serverName: tool.serverName,
    name: tool.name,
    qualifiedName: tool.qualifiedName,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    tier: tool.tier,
    destructive: tool.destructive,
    enabled: tool.enabled,
  };
}

export function createMcpConfigRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  /**
   * GET /api/mcp/tools
   * Returns the full tool registry — used by the dashboard to render toggles.
   * Dynamically builds from the same tool factories as the MCP server.
   */
  router.get('/mcp/tools', policiesMiddleware(CanServer(Action.Retrieve)), async (c) => {
    const manager = container.resolve(SessionManager);
    const registry = new ToolRegistryService(buildAllTools(manager));

    const internalTools: McpToolInfo[] = registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      tier: t.tier,
      category: t.category,
      destructive: t.destructive,
      sessionScoped: t.sessionScoped,
    }));

    const externalTools = await agentService.listExternalMcpTools();
    const externalInfo: McpToolInfo[] = externalTools.map((tool) => ({
      name: tool.qualifiedName,
      description: tool.description,
      tier: tool.tier,
      category: 'external',
      destructive: tool.destructive,
      sessionScoped: false,
      serverId: tool.serverId,
      serverName: tool.serverName,
      remoteName: tool.name,
    }));

    const tools: McpToolInfo[] = [...internalTools, ...externalInfo];

    // Group by category for UI convenience
    const byCategory: Record<string, McpToolInfo[]> = {};
    for (const tool of tools) {
      const cat = tool.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(tool);
    }

    return c.json({ tools, byCategory });
  });

  /**
   * External MCP servers
   *
   * Admin-managed list of third-party MCP servers. Tools are discovered via
   * the MCP client and cached in the store; agents select them per-agent just
   * like internal tools.
   */
  router.get('/mcp/external/servers', policiesMiddleware(CanServer(Action.Retrieve)), async (c) => {
    const servers = await agentService.listExternalMcpServers();
    const tools = await agentService.listExternalMcpTools();
    return c.json({
      servers: servers.map((server) => {
        const serverTools = tools.filter((tool) => tool.serverId === server.id);
        return {
          ...publicExternalMcpServer(server),
          toolCount: serverTools.length,
          tools: serverTools.map(publicExternalMcpTool),
        };
      }),
    });
  });

  router.get('/mcp/external/servers/:id', policiesMiddleware(CanServer(Action.Retrieve)), async (c) => {
    const server = await agentService.getExternalMcpServer(c.req.param('id'));
    if (!server) return c.json({ error: 'Not found' }, 404);
    const tools = (await agentService.listExternalMcpTools()).filter((tool) => tool.serverId === server.id);
    return c.json({
      server: {
        ...publicExternalMcpServer(server),
        toolCount: tools.length,
        tools: tools.map(publicExternalMcpTool),
      },
    });
  });

  router.get('/mcp/external/servers/:id/headers', policiesMiddleware(CanServer(Action.Manage)), async (c) => {
    const server = await agentService.getExternalMcpServer(c.req.param('id'));
    if (!server) return c.json({ error: 'Not found' }, 404);
    return c.json({ headers: server.headers });
  });

  router.post('/mcp/external/servers', policiesMiddleware(CanServer(Action.Manage)), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body?.name !== 'string' || !body.name.trim()) return c.json({ error: 'name is required' }, 400);
    const name = body.name.trim();
    if (name.length > MAX_SERVER_NAME) return c.json({ error: `name must be ${MAX_SERVER_NAME} characters or fewer` }, 400);
    if (typeof body?.url !== 'string') return c.json({ error: 'url is required' }, 400);
    const url = parseServerUrl(body.url);
    if ('error' in url) return c.json({ error: url.error }, 400);
    const headers = parseHeaders(body.headers);
    if ('error' in headers) return c.json({ error: headers.error }, 400);

    const existing = await agentService.listExternalMcpServers();
    if (existing.some((server) => server.name.toLowerCase() === name.toLowerCase())) {
      return c.json({ error: 'A server with that name already exists' }, 409);
    }

    const server = await agentService.createExternalMcpServer({
      name,
      description: typeof body.description === 'string' ? body.description.slice(0, 500) : '',
      url: url.url,
      headers: headers.headers,
      enabled: body.enabled !== false,
    });
    return c.json({ server: { ...publicExternalMcpServer(server), toolCount: 0, tools: [] } }, 201);
  });

  router.put('/mcp/external/servers/:id', policiesMiddleware(CanServer(Action.Manage)), async (c) => {
    const current = await agentService.getExternalMcpServer(c.req.param('id'));
    if (!current) return c.json({ error: 'Not found' }, 404);

    const body = await c.req.json().catch(() => ({}));
    let name: string | undefined;
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) return c.json({ error: 'name is required' }, 400);
      const nextName = body.name.trim();
      name = nextName;
      if (nextName.length > MAX_SERVER_NAME) return c.json({ error: `name must be ${MAX_SERVER_NAME} characters or fewer` }, 400);
      const duplicate = (await agentService.listExternalMcpServers()).some(
        (server) => server.id !== current.id && server.name.toLowerCase() === nextName.toLowerCase(),
      );
      if (duplicate) return c.json({ error: 'A server with that name already exists' }, 409);
    }

    let url: string | undefined;
    if (body.url !== undefined) {
      const parsed = parseServerUrl(body.url);
      if ('error' in parsed) return c.json({ error: parsed.error }, 400);
      url = parsed.url;
    }

    let headers: Record<string, string> | undefined;
    if (body.headers !== undefined) {
      const parsed = parseHeaders(body.headers);
      if ('error' in parsed) return c.json({ error: parsed.error }, 400);
      headers = parsed.headers;
    }

    const server = await agentService.updateExternalMcpServer(current.id, {
      name,
      description: typeof body.description === 'string' ? body.description.slice(0, 500) : undefined,
      url,
      headers,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    });
    if (!server) return c.json({ error: 'Not found' }, 404);
    const tools = (await agentService.listExternalMcpTools()).filter((tool) => tool.serverId === server.id);
    return c.json({
      server: {
        ...publicExternalMcpServer(server),
        toolCount: tools.length,
        tools: tools.map(publicExternalMcpTool),
      },
    });
  });

  router.delete('/mcp/external/servers/:id', policiesMiddleware(CanServer(Action.Manage)), async (c) => {
    const removed = await agentService.deleteExternalMcpServer(c.req.param('id'));
    if (!removed) return c.json({ error: 'Not found' }, 404);
    return c.json({ result: true });
  });

  router.post('/mcp/external/servers/:id/refresh', policiesMiddleware(CanServer(Action.Manage)), async (c) => {
    const id = c.req.param('id');
    const server = await agentService.getExternalMcpServer(id);
    if (!server) return c.json({ error: 'Not found' }, 404);
    try {
      const tools = await agentService.refreshExternalMcpServerTools(id);
      const updated = await agentService.getExternalMcpServer(id);
      return c.json({
        tools: tools.map(publicExternalMcpTool),
        server: updated ? publicExternalMcpServer(updated) : undefined,
      });
    } catch (error) {
      const updated = await agentService.getExternalMcpServer(id);
      return c.json(
        {
          error: error instanceof Error ? error.message : 'Could not reach the external MCP server',
          server: updated ? publicExternalMcpServer(updated) : undefined,
        },
        502,
      );
    }
  });

  /**
   * GET /api/sessions/:session/mcp
   * Returns the MCP configuration for a specific session.
   */
  router.get('/sessions/:session/mcp',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      const config = manager.getSessionConfig(sessionName);
      return c.json({
        enabled: config?.mcp?.enabled ?? true,
        allowedTools: config?.mcp?.allowedTools ?? [],
        deniedTools: config?.mcp?.deniedTools ?? [],
        destructiveOps: config?.mcp?.destructiveOps ?? false,
        hasApiKey: Boolean(config?.mcp?.apiKeyHash),
        canRevealKey: Boolean(config?.mcp?.apiKeyCiphertext),
        apiKeyPrefix: config?.mcp?.apiKeyPrefix ?? null,
        apiKeyCreatedAt: config?.mcp?.apiKeyCreatedAt ?? null,
      });
    },
  );

  /**
   * PUT /api/sessions/:session/mcp
   * Updates the MCP configuration for a specific session.
   * Accepts partial updates — only provided fields are changed.
   */
  router.put('/sessions/:session/mcp',
    policiesMiddleware(CanSession(Action.Setting, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      const body = await c.req.json() as {
        enabled?: boolean;
        allowedTools?: string[];
        deniedTools?: string[];
        destructiveOps?: boolean;
      };

      // Get current session config
      const currentConfig = manager.getSessionConfig(sessionName) || {};
      const currentMcp = currentConfig.mcp || {};

      // Merge with provided values
      const newMcp: Record<string, unknown> = {};
      if (body.enabled !== undefined) newMcp.enabled = body.enabled;
      if (body.allowedTools !== undefined) newMcp.allowedTools = body.allowedTools;
      if (body.deniedTools !== undefined) newMcp.deniedTools = body.deniedTools;
      if (body.destructiveOps !== undefined) newMcp.destructiveOps = body.destructiveOps;

      await manager.upsert(sessionName, {
        ...currentConfig,
        mcp: { ...currentMcp, ...newMcp } as typeof currentMcp,
      });

      return c.json({ result: true });
    },
  );

  /**
   * POST /api/sessions/:session/mcp/generate-key
   * Generates a new per-session MCP key (sk_mcp_...), stores SHA-256 hash,
   * and returns the plaintext key ONCE alongside ready-to-use connection configs.
   * Old key (if any) is invalidated immediately.
   */
  router.post('/sessions/:session/mcp/generate-key',
    policiesMiddleware(CanSession(Action.Setting, FromParam('session'))),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');

      // Generate a unique key
      let key: string;
      let hash: string;
      let attempts = 0;
      const maxAttempts = 5;

      do {
        key = `sk_mcp_${randomBytes(16).toString('hex')}`;
        hash = new CryptoHasher('sha256').update(key).digest('hex');
        attempts++;

        // Check uniqueness across all sessions
        const allSessions = await manager.getSessions();
        const collision = allSessions.some((s) => {
          const cfg = manager.getSessionConfig(s.name);
          return cfg?.mcp?.apiKeyHash === hash;
        });

        if (!collision) break;
      } while (attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        return c.json({ error: 'Failed to generate unique key after max attempts' }, 500);
      }

      // Save the hash for auth and a sealed copy for the admin reveal action.
      const currentConfig = manager.getSessionConfig(sessionName) || {};
      const currentMcp = currentConfig.mcp || {};
      const createdAt = new Date().toISOString();
      let ciphertext: string;
      try {
        ciphertext = sealSecret(key);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : 'Could not encrypt the MCP key' },
          500,
        );
      }
      const prefix = secretPrefix(key, 14);
      await manager.upsert(sessionName, {
        ...currentConfig,
        mcp: {
          ...currentMcp,
          apiKeyHash: hash,
          apiKeyCiphertext: ciphertext,
          apiKeyPrefix: prefix,
          apiKeyCreatedAt: createdAt,
        } as typeof currentMcp,
      }, { allowManagedKeys: true });

      // Build connection configs with the real key filled in
      const origin = `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host') || 'localhost:3000'}`;
      const httpUrl = `${origin}/mcp`;

      return c.json({
        key,
        prefix,
        createdAt,
        connection: {
          stdio: {
            command: 'bun',
            args: ['run', 'src/mcp/stdio.ts'],
            env: {
              BUNWA_SESSION: sessionName,
              BUNWA_MCP_KEY: key,
            },
          },
          http: {
            url: httpUrl,
            headers: {
              'X-Api-Key': key,
            },
          },
        },
      });
    },
  );

  /**
   * GET /api/sessions/:session/mcp/key
   * Admin-only reveal of the sealed MCP key. The hash remains the auth source.
   */
  router.get('/sessions/:session/mcp/key',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const sessionName = c.req.param('session');
      const config = manager.getSessionConfig(sessionName);
      const ciphertext = config?.mcp?.apiKeyCiphertext;
      if (!ciphertext) {
        return c.json(
          { error: 'This MCP key predates recoverable storage. Regenerate it to enable reveal.' },
          409,
        );
      }
      try {
        return c.json({
          key: openSecret(ciphertext),
          prefix: config?.mcp?.apiKeyPrefix ?? null,
          createdAt: config?.mcp?.apiKeyCreatedAt ?? null,
        });
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : 'Could not decrypt the MCP key' },
          500,
        );
      }
    },
  );

  return router;
}

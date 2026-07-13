/**
 * MCP Config REST API — serves tool registry info and per-session MCP settings
 * to the dashboard UI.
 */
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { createHash, randomBytes } from 'crypto';
import { sessionTools } from '../mcp/tools/session.tools';
import { messageTools } from '../mcp/tools/message.tools';
import { contactTools } from '../mcp/tools/contact.tools';
import { chatTools } from '../mcp/tools/chat.tools';
import { ToolRegistryService } from '../mcp/tool-registry.service';
import type { ToolCategory } from '../mcp/tool-descriptor';

export type McpToolInfo = {
  name: string;
  description: string;
  tier: string;
  category?: ToolCategory;
  destructive?: boolean;
  sessionScoped?: boolean;
};

export function createMcpConfigRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  /**
   * GET /api/mcp/tools
   * Returns the full tool registry — used by the dashboard to render toggles.
   * Dynamically builds from the same tool factories as the MCP server.
   */
  router.get('/mcp/tools', async (c) => {
    const manager = container.resolve(SessionManager);
    const allTools = [
      ...sessionTools(manager),
      ...messageTools(manager),
      ...contactTools(manager),
      ...chatTools(manager),
    ];
    const registry = new ToolRegistryService(allTools);

    const tools: McpToolInfo[] = registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      tier: t.tier,
      category: t.category,
      destructive: t.destructive,
      sessionScoped: t.sessionScoped,
    }));

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
        apiKeyHash: config?.mcp?.apiKeyHash ?? undefined,
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
        hash = createHash('sha256').update(key).digest('hex');
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

      // Save hash to session config
      const currentConfig = manager.getSessionConfig(sessionName) || {};
      const currentMcp = currentConfig.mcp || {};
      await manager.upsert(sessionName, {
        ...currentConfig,
        mcp: { ...currentMcp, apiKeyHash: hash } as typeof currentMcp,
      });

      // Build connection configs with the real key filled in
      const origin = `${c.req.header('x-forwarded-proto') || 'http'}://${c.req.header('host') || 'localhost:3000'}`;
      const httpUrl = `${origin}/mcp`;

      return c.json({
        key,
        keyHash: hash,
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

  return router;
}

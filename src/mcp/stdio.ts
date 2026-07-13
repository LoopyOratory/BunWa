#!/usr/bin/env bun
/**
 * BunWa MCP — stdio transport entry point.
 *
 * Spawned by MCP clients (Claude Desktop, Cursor, etc.) as a subprocess.
 * Reads BUNWA_SESSION and BUNWA_MCP_KEY from environment.
 * Communicates via stdin/stdout using the MCP protocol.
 *
 * Connection config (paste into your MCP client):
 *   {
 *     "mcpServers": {
 *       "bunwa-default": {
 *         "command": "bun",
 *         "args": ["run", "src/mcp/stdio.ts"],
 *         "env": {
 *           "BUNWA_SESSION": "default",
 *           "BUNWA_MCP_KEY": "sk_mcp_..."
 *         }
 *       }
 *     }
 *   }
 */

import 'reflect-metadata';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { container } from 'tsyringe';
import { createHash } from 'crypto';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { ToolRegistryService } from './tool-registry.service';
import { sessionTools } from './tools/session.tools';
import { messageTools } from './tools/message.tools';
import { contactTools } from './tools/contact.tools';
import { chatTools } from './tools/chat.tools';
import { isToolAllowed } from './mcp.server';

const sessionName = process.env.BUNWA_SESSION;
const mcpKey = process.env.BUNWA_MCP_KEY;

if (!sessionName || !mcpKey) {
  process.stderr.write('BUNWA_SESSION and BUNWA_MCP_KEY must be set\n');
  process.exit(1);
}

try {
  configureContainer();
} catch {
  // Container may already be configured if running in same process
}

const manager = container.resolve(SessionManager);

// Auth: hash the provided key and verify it matches this session's stored hash
const providedHash = createHash('sha256').update(mcpKey).digest('hex');
const config = manager.getSessionConfig(sessionName);

if (!config?.mcp?.apiKeyHash || config.mcp.apiKeyHash !== providedHash) {
  process.stderr.write(
    `Invalid or expired MCP key for session "${sessionName}". ` +
    'Regenerate the key from the BunWa dashboard (Session Settings → MCP → Generate Key).\n',
  );
  process.exit(1);
}

// Build the same tool set as the HTTP server, auto-scoped to this session
const tools = [
  ...sessionTools(manager),
  ...messageTools(manager),
  ...contactTools(manager),
  ...chatTools(manager),
];
const registry = new ToolRegistryService(tools);

const server = new McpServer(
  { name: 'bunwa', version: '1.0.0' },
  { capabilities: { tools: {}, logging: {} } },
);

for (const tool of registry.list()) {
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
    async (input: Record<string, unknown>) => {
      // Auto-scope: force sessionId to the scoped session for session-scoped tools
      if (tool.sessionScoped) {
        input.sessionId = sessionName;
      }
      // Check per-session policy (allow/deny/destructive)
      const { allowed, reason } = isToolAllowed(tool, config?.mcp);
      if (!allowed) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, name: 'PermissionDenied', message: reason || 'Tool not allowed' }) }],
          isError: true,
        };
      }
      return tool.handler(input as never);
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);

// StdioServerTransport keeps the process alive via stdin.
// When the client disconnects (stdin closes), the process exits naturally.

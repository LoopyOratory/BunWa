/**
 * Re-export all tool definition factories.
 */
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';
import type { ExternalMcpTool } from '../../core/agent/agent.types';
import { callExternalServerTool } from '../external-mcp.client';
import { z } from 'zod';
import { sessionTools } from './session.tools';
import { messageTools } from './message.tools';
import { contactTools } from './contact.tools';
import { chatTools } from './chat.tools';
import { statusTools } from './status.tools';
import { presenceTools } from './presence.tools';
import { policyTools } from './policy.tools';
import { templateTools } from './template.tools';
import { groupTools } from './group.tools';
import { channelTools } from './channel.tools';
import { mediaTools } from './media.tools';
import { uploadTools } from './upload.tools';
import { callsTools } from './calls.tools';

export { sessionTools } from './session.tools';
export { messageTools } from './message.tools';
export { contactTools } from './contact.tools';
export { chatTools } from './chat.tools';
export { statusTools } from './status.tools';
export { presenceTools } from './presence.tools';
export { policyTools } from './policy.tools';
export { templateTools } from './template.tools';
export { groupTools } from './group.tools';
export { channelTools } from './channel.tools';
export { mediaTools } from './media.tools';
export { uploadTools } from './upload.tools';
export { callsTools } from './calls.tools';

/**
 * The one place that knows every tool family.
 *
 * The MCP server and the dashboard's tool list both build their registry from
 * this, because they used to keep separate lists: a family added to one was
 * silently missing from the other, which is how the group category ended up
 * advertised with no tools in it and the dashboard never showed the channels.
 */
export function buildAllTools(
  manager: SessionManager,
  externalTools: ExternalMcpTool[] = [],
  externalServerLookup: Map<string, { url: string; headers: Record<string, string>; name: string }> = new Map(),
): ToolDescriptor[] {
  const internal: ToolDescriptor[] = [
    ...sessionTools(manager),
    ...messageTools(manager),
    ...contactTools(manager),
    ...chatTools(manager),
    ...statusTools(manager),
    ...presenceTools(manager),
    ...policyTools(manager),
    ...templateTools(manager),
    ...groupTools(manager),
    ...channelTools(manager),
    ...mediaTools(manager),
    ...uploadTools(manager),
    ...callsTools(manager),
  ];

  const external: ToolDescriptor[] = externalTools.map((tool) => {
    const server = externalServerLookup.get(tool.serverId);
    const category = (tool.serverName || 'external') as never;
    return {
      name: tool.name,
      description: `${server?.name ? `${server.name}: ` : ''}${tool.description}`,
      inputSchema: z.any(),
      tier: tool.tier,
      destructive: tool.destructive,
      external: true,
      idempotent: tool.annotations?.idempotentHint ?? tool.tier === 'read',
      sessionScoped: false,
      category,
      resultDisposition: 'smart' as const,
      handler: async (input: Record<string, unknown>) => {
        if (!server) {
          throw new Error(`External MCP server for tool '${tool.name}' is no longer configured`);
        }
        return callExternalServerTool(
          { id: tool.serverId, name: server.name, description: '', url: server.url, headers: server.headers, enabled: true, createdAt: '', updatedAt: '' },
          tool.name,
          input,
        );
      },
    };
  });

  return [...internal, ...external];
}

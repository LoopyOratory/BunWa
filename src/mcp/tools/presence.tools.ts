/**
 * Presence MCP tools for WAHA-Bun.
 * Uses session object methods directly (getPresences, setPresence, etc.)
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z
  .string()
  .min(1)
  // Optional so a session-scoped MCP key can call the tool without naming its
  // session: the key supplies it before the handler runs, and the server
  // answers a clear error when neither is present. Defaulted to an empty
  // string rather than left undefined so every handler keeps a string type.
  .optional()
  .default('')
  .describe('Session name (e.g. "default"). Not needed when the key is a session-scoped MCP key, which supplies it.');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function presenceTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'PresenceGetAll',
      description: 'Get the last known presence status for all subscribed chats.',
      tier: 'read',
      category: 'presence',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getPresences();
      },
    },
    {
      name: 'PresenceSet',
      description: "Set this account's own presence status (online/offline/typing/recording/paused), optionally scoped to a chat.",
      tier: 'write',
      category: 'presence',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        presence: z.enum(['offline', 'online', 'typing', 'recording', 'paused']).describe('Presence status to set'),
        chatId: z.string().optional().describe('Chat JID to scope the presence to (e.g. for typing/recording)'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).setPresence(input.presence, input.chatId);
        return { success: true };
      },
    },
    {
      name: 'PresenceGetForChat',
      description: 'Get the last known presence status for a specific chat.',
      tier: 'read',
      category: 'presence',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID to look up'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getPresence(input.chatId);
      },
    },
    {
      name: 'PresenceSubscribe',
      description: "Subscribe to a chat's presence updates so future changes are received.",
      tier: 'write',
      category: 'presence',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID to subscribe to'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).subscribePresence(input.chatId);
        return { success: true };
      },
    },
  ];
}

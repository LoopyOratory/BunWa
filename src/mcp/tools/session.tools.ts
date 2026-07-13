/**
 * Session-related MCP tools for WAHA-Bun.
 * Uses SessionManager directly instead of NestJS DI services.
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z.string().min(1).describe('Session name (e.g. "default")');

export function sessionTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'SessionList',
      description:
        'List all WhatsApp sessions this server manages (name, status). Use to discover available sessions before calling session-scoped tools.',
      tier: 'read',
      category: 'session',
      inputSchema: z.object({}),
      handler: async () => {
        const sessions = await manager.getSessions();
        return sessions.map(s => ({
          name: s.name,
          status: s.status,
        }));
      },
    },
    {
      name: 'SessionGet',
      description: 'Get details for a specific session by name, including connection status and config.',
      tier: 'read',
      category: 'session',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input: { sessionId: string }) => {
        try {
          const session = manager.getSession(input.sessionId);
          return {
            name: input.sessionId,
            status: (session as any).status || 'UNKNOWN',
            config: (session as any).sessionConfig || {},
            me: (session as any).getSessionMeInfo?.() || null,
          };
        } catch {
          return { name: input.sessionId, status: 'STOPPED', config: {}, me: null };
        }
      },
    },
    {
      name: 'SessionStart',
      description: 'Start a WhatsApp session. The session must be created first via the REST API.',
      tier: 'write',
      category: 'session',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input: { sessionId: string }) => {
        const result = await manager.start(input.sessionId);
        return {
          name: input.sessionId,
          status: result.status || 'STARTING',
        };
      },
    },
    {
      name: 'SessionStop',
      description: 'Stop a running WhatsApp session.',
      tier: 'write',
      category: 'session',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input: { sessionId: string }) => {
        await manager.stop(input.sessionId);
        return { name: input.sessionId, status: 'STOPPED' };
      },
    },
    {
      name: 'SessionRestart',
      description: 'Restart a WhatsApp session (stop + start).',
      tier: 'write',
      category: 'session',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input: { sessionId: string }) => {
        const result = await manager.restart(input.sessionId);
        return {
          name: input.sessionId,
          status: result.status || 'STARTING',
        };
      },
    },
    {
      name: 'SessionCheckNumber',
      description:
        'Check whether a phone number is registered on WhatsApp. Returns exists flag and the WhatsApp JID if found.',
      tier: 'read',
      category: 'session',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        phone: z.string().describe('Phone number to check (e.g. 628123456789, digits only)'),
      }),
      handler: async (input: { sessionId: string; phone: string }) => {
        const session = await manager.getWorkingSession(input.sessionId);
        const result = await (session as any).checkNumberStatus({ phone: input.phone });
        return {
          phone: input.phone,
          exists: result?.numberVerified || false,
          whatsappId: result?.wid || null,
          result,
        };
      },
    },
  ];
}

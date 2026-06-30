/**
 * Contact-related MCP tools for WAHA-Bun.
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z.string().min(1).describe('Session name (e.g. "default")');

export function contactTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'ContactCheckNumber',
      description:
        'Check whether a phone number is registered on WhatsApp. Returns exists flag and the WhatsApp JID if found.',
      tier: 'read',
      category: 'contact',
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
        };
      },
    },
  ];
}

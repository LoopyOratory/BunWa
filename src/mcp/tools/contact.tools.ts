/**
 * Contact-related MCP tools for WAHA-Bun.
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

export function contactTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'ContactList',
      description:
        'List the contacts this session knows, with pagination. Omit limit to return every contact; ' +
        'pass limit and offset to page through a large book (a big result arrives as an MCP resource, ' +
        'not inline text). Mirrors GET /api/contacts/all.',
      tier: 'read',
      category: 'contact',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Maximum contacts to return. Omit to return all of them'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of contacts to skip. Needs a limit to take effect'),
      }),
      handler: async (input: { sessionId: string; limit?: number; offset?: number }) => {
        const session = await manager.getWorkingSession(input.sessionId);
        return (session as any).getContacts({ limit: input.limit, offset: input.offset });
      },
    },
    {
      name: 'ContactCheckNumber',
      description:
        'Check whether a phone number or WhatsApp username resolves on WhatsApp. ' +
        'Returns status resolved, not_resolvable or could_not_check, plus exists (true, false or null). ' +
        'not_resolvable means WhatsApp answered that the target is not registered. ' +
        'could_not_check means no usable answer (engine unsupported, query failed or empty answer) and is not proof of absence. ' +
        'A resolved username returns the LID and any locally known display name, never a phone number.',
      tier: 'read',
      category: 'contact',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        phone: z.string().describe('Phone number (e.g. 628123456789, digits only) or a WhatsApp username (handle or @handle); username lookup needs the NOWEB engine'),
      }),
      handler: async (input: { sessionId: string; phone: string }) => {
        const session = await manager.getWorkingSession(input.sessionId);
        const result = await (session as any).checkNumberStatus({ phone: input.phone });
        return {
          phone: input.phone,
          status: result?.status ?? 'could_not_check',
          exists: result?.exists ?? null,
          whatsappId: result?.number ?? null,
          username: result?.username ?? null,
          lid: result?.lid ?? null,
          pushName: result?.pushName ?? null,
          reason: result?.reason ?? null,
        };
      },
    },
  ];
}

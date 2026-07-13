/**
 * Status (WhatsApp Stories) MCP tools for WAHA-Bun.
 * Uses session object methods directly (sendTextStatus, deleteStatus, etc.)
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z.string().min(1).describe('Session name (e.g. "default")');
const statusId = z.string().optional().describe('Optional message ID for the status (generate with MessageGenerateId)');
const statusContacts = z
  .array(z.string())
  .optional()
  .describe('Contact JIDs to send the status to. Omit to broadcast to all contacts.');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function statusTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'StatusSendText',
      description: 'Send a text status update (WhatsApp Story).',
      tier: 'write',
      category: 'status',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        text: z.string().min(1).describe('Status text content'),
        backgroundColor: z.string().optional().describe('Background color hex, e.g. "#000000"'),
        font: z.string().optional().describe('Font identifier'),
        id: statusId,
        contacts: statusContacts,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendTextStatus({
          text: input.text,
          backgroundColor: input.backgroundColor,
          font: input.font,
          id: input.id,
          contacts: input.contacts,
        });
      },
    },
    {
      name: 'StatusSendImage',
      description: 'Send an image status update (WhatsApp Story) via URL or base64.',
      tier: 'write',
      category: 'status',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        file: z.string().describe('Image URL or base64 data'),
        caption: z.string().max(1024).optional(),
        id: statusId,
        contacts: statusContacts,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendImageStatus({
          file: input.file,
          caption: input.caption,
          id: input.id,
          contacts: input.contacts,
        });
      },
    },
    {
      name: 'StatusSendVoice',
      description: 'Send a voice status update (WhatsApp Story) via URL or base64.',
      tier: 'write',
      category: 'status',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        file: z.string().describe('Audio URL or base64 data'),
        backgroundColor: z.string().optional().describe('Background color hex, e.g. "#000000"'),
        id: statusId,
        contacts: statusContacts,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendVoiceStatus({
          file: input.file,
          backgroundColor: input.backgroundColor,
          id: input.id,
          contacts: input.contacts,
        });
      },
    },
    {
      name: 'StatusSendVideo',
      description: 'Send a video status update (WhatsApp Story) via URL or base64.',
      tier: 'write',
      category: 'status',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        file: z.string().describe('Video URL or base64 data'),
        caption: z.string().max(1024).optional(),
        id: statusId,
        contacts: statusContacts,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendVideoStatus({
          file: input.file,
          caption: input.caption,
          id: input.id,
          contacts: input.contacts,
        });
      },
    },
    {
      name: 'StatusDelete',
      description: 'Delete a previously sent status update.',
      tier: 'write',
      category: 'status',
      destructive: true,
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        id: z.string().describe('ID of the status message to delete'),
        contacts: statusContacts,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).deleteStatus({ id: input.id, contacts: input.contacts });
        return { success: true };
      },
    },
    {
      name: 'StatusGenerateId',
      description: 'Generate a new message ID to use for a status update.',
      tier: 'read',
      category: 'status',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        const id = await (session as any).generateNewMessageId();
        return { id };
      },
    },
  ];
}

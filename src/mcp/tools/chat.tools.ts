/**
 * Chat MCP tools for WAHA-Bun — messages, labels, and LID lookups.
 * Uses session object methods directly (getChatMessages, pinMessage, etc.)
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z.string().min(1).describe('Session name (e.g. "default")');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function chatTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'ChatGetMessages',
      description: 'Get messages from a chat, most recent first.',
      tier: 'read',
      category: 'chat',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID (e.g. 1234567890@c.us or groupId@g.us)'),
        limit: z.number().int().min(1).max(500).optional().describe('Max number of messages to return (default 50)'),
        offset: z.number().int().min(0).optional().describe('Number of messages to skip (default 0)'),
        downloadMedia: z.boolean().optional().describe('Whether to download media attachments (default false)'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getChatMessages(
          input.chatId,
          { limit: input.limit ?? 50, offset: input.offset ?? 0, downloadMedia: input.downloadMedia ?? false },
          {}
        );
      },
    },
    {
      name: 'ChatGetMessage',
      description: 'Get a single message from a chat by its message ID.',
      tier: 'read',
      category: 'chat',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID containing the message'),
        messageId: z.string().describe('ID of the message to fetch'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getChatMessage(input.chatId, input.messageId, {});
      },
    },
    {
      name: 'ChatMarkMessagesRead',
      description: 'Mark messages in a chat as read.',
      tier: 'write',
      category: 'chat',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID (e.g. 1234567890@c.us)'),
        count: z.number().int().min(1).optional().describe('Number of most recent messages to mark as read (default: all)'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).readChatMessages(input.chatId, input.count ? { count: input.count } : {});
        return { success: true };
      },
    },
    {
      name: 'ChatPinMessage',
      description: 'Pin a message in a chat for a duration (in seconds).',
      tier: 'write',
      category: 'chat',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID containing the message'),
        messageId: z.string().describe('ID of the message to pin'),
        duration: z.number().int().min(1).optional().describe('Pin duration in seconds (default 7)'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).pinMessage(input.chatId, input.messageId, input.duration || 7);
        return { success: true };
      },
    },
    {
      name: 'ChatSetLabels',
      description: 'Set (replace) the labels assigned to a chat.',
      tier: 'write',
      category: 'chat',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        labels: z.array(z.string()).describe('Label IDs to assign to the chat'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).putLabelsToChat(input.chatId, input.labels);
        return { success: true };
      },
    },
    {
      name: 'ContactFindPhoneByLid',
      description: 'Resolve a WhatsApp LID (privacy ID) to its underlying phone number.',
      tier: 'read',
      category: 'contact',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        lid: z.string().describe('LID to resolve (e.g. "123456789" or "123456789@lid")'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        const lid = input.lid.endsWith('@lid') ? input.lid : `${input.lid}@lid`;
        return (session as any).findPNByLid(lid);
      },
    },
  ];
}

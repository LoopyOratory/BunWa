/**
 * Message/chatting MCP tools for WAHA-Bun.
 * Uses session object methods directly (sendText, sendImage, etc.)
 */
import { z } from 'zod';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';

const sessionId = z.string().min(1).describe('Session name (e.g. "default")');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function messageTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'MessageSendText',
      description: 'Send a plain text message to a chat or group.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID (e.g. 628123456789@c.us or groupId@g.us)'),
        text: z.string().min(1).max(4096).describe('Text message content'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendText({
          session: input.sessionId,
          chatId: input.chatId,
          text: input.text,
        });
      },
    },
    {
      name: 'MessageSendImage',
      description: 'Send an image message via URL or base64.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        file: z.string().describe('Image URL or base64 data'),
        caption: z.string().max(1024).optional(),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendImage({
          session: input.sessionId,
          chatId: input.chatId,
          file: input.file,
          caption: input.caption,
        });
      },
    },
    {
      name: 'MessageSendFile',
      description: 'Send a file/document message via URL or base64.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        file: z.string().describe('File URL or base64 data'),
        caption: z.string().max(1024).optional(),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendFile({
          session: input.sessionId,
          chatId: input.chatId,
          file: input.file,
          caption: input.caption,
        });
      },
    },
    {
      name: 'MessageSendVoice',
      description: 'Send a voice/audio message via URL or base64.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        file: z.string().describe('Audio URL or base64 data'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendVoice({
          session: input.sessionId,
          chatId: input.chatId,
          file: input.file,
        });
      },
    },
    {
      name: 'MessageSendVideo',
      description: 'Send a video message via URL or base64.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        file: z.string().describe('Video URL or base64 data'),
        caption: z.string().max(1024).optional(),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendVideo({
          session: input.sessionId,
          chatId: input.chatId,
          file: input.file,
          caption: input.caption,
        });
      },
    },
    {
      name: 'MessageSendLocation',
      description: 'Send a location pin message.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        latitude: z.number().min(-90).max(90).describe('Latitude coordinate'),
        longitude: z.number().min(-180).max(180).describe('Longitude coordinate'),
        title: z.string().optional().describe('Location label/title'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendLocation({
          session: input.sessionId,
          chatId: input.chatId,
          latitude: input.latitude,
          longitude: input.longitude,
          title: input.title,
        });
      },
    },
    {
      name: 'MessageSendPoll',
      description: 'Send a poll message to a chat.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        poll: z.object({
          name: z.string().describe('Poll question'),
          values: z.array(z.string()).min(2).describe('Poll options (2-12)'),
          selectableCount: z.number().int().min(1).optional().describe('How many options can be selected'),
        }),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendPoll({
          session: input.sessionId,
          chatId: input.chatId,
          poll: input.poll,
        });
      },
    },
    {
      name: 'MessageSendContactVCard',
      description: 'Send a contact card (vCard) message.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        contacts: z.array(z.object({
          displayName: z.string().describe('Contact display name'),
          vcard: z.string().describe('vCard string'),
        })).min(1).describe('Contacts to share'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendContactVCard({
          session: input.sessionId,
          chatId: input.chatId,
          contacts: input.contacts,
        });
      },
    },
    {
      name: 'MessageSendLinkPreview',
      description: 'Send a message with a link preview.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        url: z.string().url().describe('URL to preview'),
        title: z.string().optional().describe('Preview title'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendLinkPreview({
          session: input.sessionId,
          chatId: input.chatId,
          url: input.url,
          title: input.title,
        });
      },
    },
    {
      name: 'MessageReply',
      description: 'Reply to a specific message (quoted reply).',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        messageId: z.string().describe('ID of the message to reply to'),
        text: z.string().min(1).describe('Reply text content'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).reply({
          session: input.sessionId,
          chatId: input.chatId,
          text: input.text,
          reply_to: input.messageId,
        });
      },
    },
    {
      name: 'MessageForward',
      description: 'Forward a message to another chat.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Destination chat JID'),
        messageId: z.string().describe('ID of the message to forward'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).forwardMessage({
          session: input.sessionId,
          chatId: input.chatId,
          messageId: input.messageId,
        });
      },
    },
    {
      name: 'MessageReact',
      description:
        'Add or remove a reaction emoji on a message. Send empty string to remove.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID containing the message'),
        messageId: z.string().describe('ID of the message to react to'),
        reaction: z.string().describe('Emoji to react with. Empty string removes the reaction.'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).setReaction({
          session: input.sessionId,
          chatId: input.chatId,
          messageId: input.messageId,
          reaction: input.reaction,
        });
        return { success: true };
      },
    },
    {
      name: 'MessageStar',
      description: 'Star or unstar a message.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        messageId: z.string().describe('ID of the message'),
        star: z.boolean().describe('true to star, false to unstar'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).setStar({
          session: input.sessionId,
          chatId: input.chatId,
          messageId: input.messageId,
          star: input.star,
        });
        return { success: true };
      },
    },
    {
      name: 'MessageMarkRead',
      description: 'Mark a chat as read (clears unread count).',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID (e.g. 1234567890@c.us)'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).sendSeen({
          session: input.sessionId,
          chatId: input.chatId,
        });
        return { success: true };
      },
    },
    {
      name: 'MessageStartTyping',
      description: 'Show typing indicator in a chat.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).startTyping({
          session: input.sessionId,
          chatId: input.chatId,
        });
        return { success: true };
      },
    },
    {
      name: 'MessageStopTyping',
      description: 'Stop typing indicator in a chat.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).stopTyping({
          session: input.sessionId,
          chatId: input.chatId,
        });
        return { success: true };
      },
    },
    {
      name: 'MessageVotePoll',
      description: 'Vote on a poll message.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID containing the poll'),
        pollMessageId: z.string().describe('ID of the poll message'),
        pollServerId: z.string().optional().describe('Poll server ID, if known'),
        votes: z.array(z.string()).describe('Poll option values to vote for'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendPollVote({
          session: input.sessionId,
          chatId: input.chatId,
          pollMessageId: input.pollMessageId,
          pollServerId: input.pollServerId,
          votes: input.votes,
        });
      },
    },
    {
      name: 'MessageSendButtons',
      description: 'Send an interactive message with reply/URL/call/copy buttons.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        buttons: z.array(z.object({
          type: z.enum(['reply', 'url', 'call', 'copy']),
          text: z.string().describe('Button label'),
          id: z.string().optional().describe('Button ID (for reply buttons)'),
          url: z.string().optional().describe('URL (for url buttons)'),
          phoneNumber: z.string().optional().describe('Phone number (for call buttons)'),
          copyCode: z.string().optional().describe('Code to copy (for copy buttons)'),
        })).min(1).describe('Buttons to display (1-3 typically)'),
        header: z.string().optional().describe('Header text'),
        body: z.string().optional().describe('Body text'),
        footer: z.string().optional().describe('Footer text'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendButtons({
          session: input.sessionId,
          chatId: input.chatId,
          buttons: input.buttons,
          header: input.header,
          body: input.body,
          footer: input.footer,
        });
      },
    },
    {
      name: 'MessageSendList',
      description: 'Send an interactive list message with selectable sections.',
      tier: 'write',
      category: 'message',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().describe('Chat JID'),
        title: z.string().describe('List message title'),
        description: z.string().describe('List message description'),
        button: z.string().describe('Label of the button that opens the list'),
        sections: z.array(z.object({
          title: z.string().describe('Section title'),
          rows: z.array(z.object({
            rowId: z.string().describe('Row ID returned when selected'),
            title: z.string().describe('Row title'),
            description: z.string().optional().describe('Row description'),
          })),
        })).min(1).describe('Sections of selectable rows'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).sendList({
          session: input.sessionId,
          chatId: input.chatId,
          title: input.title,
          description: input.description,
          button: input.button,
          sections: input.sections,
        });
      },
    },
    {
      name: 'MessageGenerateId',
      description: 'Generate a new WhatsApp message ID, e.g. to use for a scheduled/pre-signed send.',
      tier: 'read',
      category: 'message',
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

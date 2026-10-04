/**
 * Channel (WhatsApp newsletter) MCP tools.
 *
 * Channels are read-mostly: the directory search is how you find one, and
 * following is what makes its messages arrive. Creating and deleting a channel
 * is possible from the API and is offered here, with delete marked destructive.
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
const channelId = z
  .string()
  .min(1)
  .describe('Channel id ending in @newsletter, as returned by ChannelList or the search tools');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function channelTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'ChannelList',
      description: 'List the channels this session follows.',
      tier: 'read',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).channelsList({});
      },
    },
    {
      name: 'ChannelGet',
      description:
        'Get one channel: name, description, invite link and preview. A channel this session does not follow answers 404.',
      tier: 'read',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, channelId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).channelsGetChannel(input.channelId);
      },
    },
    {
      name: 'ChannelSearchByText',
      description:
        'Search the channel directory by text. This is the working search: it returns channels with their id, name, invite link and preview.',
      tier: 'read',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        text: z.string().min(1).describe('Search text, for example "news"'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum channels to return'),
        startCursor: z.string().optional().describe('Cursor from a previous page'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).searchChannelsByText({
          text: input.text,
          limit: input.limit,
          startCursor: input.startCursor,
        });
      },
    },
    {
      name: 'ChannelSearchByView',
      description:
        'Search the channel directory by view. WhatsApp currently refuses this query for every view value, so prefer ChannelSearchByText.',
      tier: 'read',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        view: z.string().min(1).describe('View name, for example RECOMMENDED'),
        countries: z.array(z.string()).optional().describe('Country codes to filter by'),
        categories: z.array(z.string()).optional(),
        limit: z.number().int().min(1).max(50).optional(),
        startCursor: z.string().optional(),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).searchChannelsByView({
          view: input.view,
          countries: input.countries,
          categories: input.categories,
          limit: input.limit,
          startCursor: input.startCursor,
        });
      },
    },
    {
      name: 'ChannelFollow',
      description: 'Follow a channel so its posts arrive in this account.',
      tier: 'write',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, channelId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).channelsFollowChannel(input.channelId);
        return { success: true };
      },
    },
    {
      name: 'ChannelUnfollow',
      description: 'Stop following a channel.',
      tier: 'write',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, channelId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).channelsUnfollowChannel(input.channelId);
        return { success: true };
      },
    },
    {
      name: 'ChannelMute',
      description: 'Mute a channel, keeping the follow but silencing notifications.',
      tier: 'write',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, channelId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).channelsMuteChannel(input.channelId);
        return { success: true };
      },
    },
    {
      name: 'ChannelUnmute',
      description: 'Unmute a channel.',
      tier: 'write',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, channelId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).channelsUnmuteChannel(input.channelId);
        return { success: true };
      },
    },
    {
      name: 'ChannelCreate',
      description: 'Create a channel owned by this account.',
      tier: 'write',
      category: 'channel',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        name: z.string().min(1).describe('Channel name'),
        description: z.string().optional().describe('Channel description'),
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).channelsCreateChannel({
          name: input.name,
          description: input.description,
        });
      },
    },
    {
      name: 'ChannelDelete',
      description: 'Delete a channel this account owns.',
      tier: 'write',
      category: 'channel',
      sessionScoped: true,
      destructive: true,
      inputSchema: z.object({ sessionId, channelId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).channelsDeleteChannel(input.channelId);
        return { success: true };
      },
    },
  ];
}

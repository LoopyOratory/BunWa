import 'reflect-metadata';
import { describe, it, expect } from 'bun:test';
import { groupTools } from '../mcp/tools/group.tools';
import { channelTools } from '../mcp/tools/channel.tools';
import { isToolAllowed } from '../mcp/mcp.server';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * The group and channel MCP tools.
 *
 * The group category existed in the descriptor with no tools in it, so an agent
 * could send messages but could not touch a group; channels had no category at
 * all. These tests pin the contract an agent depends on: the tools exist, the
 * ones that change membership or destroy something carry `destructive` so the
 * per-session gate holds them back, and every handler forwards to the same
 * engine method the REST route uses, with the participants payload as plain
 * chat id strings.
 */

const calls: { method: string; args: any[] }[] = [];

function makeManager(session: any): SessionManager {
  return {
    getWorkingSession: async () => session,
  } as unknown as SessionManager;
}

function makeSession() {
  const record = (method: string) => async (...args: any[]) => {
    calls.push({ method, args });
    return { method, args };
  };
  return {
    getGroups: record('getGroups'),
    getGroup: record('getGroup'),
    createGroup: record('createGroup'),
    getGroupParticipants: record('getGroupParticipants'),
    addParticipants: record('addParticipants'),
    removeParticipants: record('removeParticipants'),
    promoteParticipantsToAdmin: record('promoteParticipantsToAdmin'),
    demoteParticipantsToUser: record('demoteParticipantsToUser'),
    setSubject: record('setSubject'),
    setDescription: record('setDescription'),
    getInviteCode: record('getInviteCode'),
    revokeInviteCode: record('revokeInviteCode'),
    leaveGroup: record('leaveGroup'),
    refreshGroups: record('refreshGroups'),
    channelsList: record('channelsList'),
    channelsGetChannel: record('channelsGetChannel'),
    searchChannelsByText: record('searchChannelsByText'),
    searchChannelsByView: record('searchChannelsByView'),
    channelsFollowChannel: record('channelsFollowChannel'),
    channelsUnfollowChannel: record('channelsUnfollowChannel'),
    channelsMuteChannel: record('channelsMuteChannel'),
    channelsUnmuteChannel: record('channelsUnmuteChannel'),
    channelsCreateChannel: record('channelsCreateChannel'),
    channelsDeleteChannel: record('channelsDeleteChannel'),
  };
}

function tool(tools: ToolDescriptor[], name: string): ToolDescriptor {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`Tool ${name} not found`);
  return found;
}

async function call(descriptor: ToolDescriptor, input: unknown): Promise<any> {
  const parsed = descriptor.inputSchema.parse(input);
  return await descriptor.handler(parsed as never);
}

const groupId = '120363000000000001@g.us';
const channelId = '120363000000000002@newsletter';

describe('group MCP tools', () => {
  const session = makeSession();
  const tools = groupTools(makeManager(session));

  it('registers the whole group family', () => {
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'GroupAddParticipants',
        'GroupCreate',
        'GroupDemoteParticipants',
        'GroupGet',
        'GroupGetInviteCode',
        'GroupGetParticipants',
        'GroupLeave',
        'GroupList',
        'GroupPromoteParticipants',
        'GroupRefresh',
        'GroupRemoveParticipants',
        'GroupRevokeInviteCode',
        'GroupSetDescription',
        'GroupSetSubject',
      ].sort(),
    );
    expect(tools.every((t) => t.category === 'group')).toBe(true);
    expect(tools.every((t) => t.sessionScoped === true)).toBe(true);
  });

  it('marks the irreversible operations destructive', () => {
    const destructive = tools.filter((t) => t.destructive).map((t) => t.name).sort();
    expect(destructive).toEqual([
      'GroupLeave',
      'GroupRemoveParticipants',
      'GroupRevokeInviteCode',
    ]);
    // Reading a group or its invite code is never destructive
    expect(tool(tools, 'GroupGet').destructive).toBeUndefined();
    expect(tool(tools, 'GroupGetInviteCode').destructive).toBeUndefined();
  });

  it('the destructive gate holds those back for a session', () => {
    const denied = isToolAllowed(tool(tools, 'GroupLeave'), {
      enabled: true,
      destructiveOps: false,
    } as any);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('Destructive operation');

    const allowed = isToolAllowed(tool(tools, 'GroupLeave'), {
      enabled: true,
      destructiveOps: true,
    } as any);
    expect(allowed.allowed).toBe(true);
  });

  it('createGroup forwards chat id strings untouched', async () => {
    calls.length = 0;
    await call(tool(tools, 'GroupCreate'), {
      sessionId: 'default',
      name: 'Drill',
      participants: ['15551234567', '15551234567@c.us'],
    });
    expect(calls).toEqual([
      {
        method: 'createGroup',
        args: [{ name: 'Drill', participants: ['15551234567', '15551234567@c.us'] }],
      },
    ]);
  });

  it('participant tools use the ParticipantsRequest shape', async () => {
    calls.length = 0;
    await call(tool(tools, 'GroupRemoveParticipants'), {
      sessionId: 'default',
      groupId,
      participants: ['15551234567@c.us'],
    });
    expect(calls).toEqual([
      { method: 'removeParticipants', args: [groupId, { participants: ['15551234567@c.us'] }] },
    ]);
  });

  it('rejects an empty participant list before it reaches the engine', () => {
    expect(() =>
      tool(tools, 'GroupAddParticipants').inputSchema.parse({
        sessionId: 'default',
        groupId,
        participants: [],
      }),
    ).toThrow();
  });

  it('subject and description answer success without echoing the group', async () => {
    calls.length = 0;
    const result = await call(tool(tools, 'GroupSetSubject'), {
      sessionId: 'default',
      groupId,
      subject: 'BunWa Drill',
    });
    expect(result).toEqual({ success: true });
    expect(calls).toEqual([{ method: 'setSubject', args: [groupId, 'BunWa Drill'] }]);
  });
});

describe('channel MCP tools', () => {
  const session = makeSession();
  const tools = channelTools(makeManager(session));

  it('registers the channel family under its own category', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'ChannelCreate',
        'ChannelDelete',
        'ChannelFollow',
        'ChannelGet',
        'ChannelList',
        'ChannelMute',
        'ChannelSearchByText',
        'ChannelSearchByView',
        'ChannelUnfollow',
        'ChannelUnmute',
      ].sort(),
    );
    expect(tools.every((t) => t.category === 'channel')).toBe(true);
  });

  it('only delete is destructive', () => {
    expect(tools.filter((t) => t.destructive).map((t) => t.name)).toEqual(['ChannelDelete']);
  });

  it('search by text forwards the working field name', async () => {
    calls.length = 0;
    await call(tool(tools, 'ChannelSearchByText'), {
      sessionId: 'default',
      text: 'news',
      limit: 5,
    });
    expect(calls).toEqual([
      { method: 'searchChannelsByText', args: [{ text: 'news', limit: 5, startCursor: undefined }] },
    ]);
  });

  it('requires text for the by-text search', () => {
    expect(() =>
      tool(tools, 'ChannelSearchByText').inputSchema.parse({ sessionId: 'default' }),
    ).toThrow();
  });

  it('follow and unfollow reach the engine', async () => {
    calls.length = 0;
    await call(tool(tools, 'ChannelFollow'), { sessionId: 'default', channelId });
    await call(tool(tools, 'ChannelUnfollow'), { sessionId: 'default', channelId });
    expect(calls.map((c) => c.method)).toEqual([
      'channelsFollowChannel',
      'channelsUnfollowChannel',
    ]);
    expect(calls.every((c) => c.args[0] === channelId)).toBe(true);
  });
});

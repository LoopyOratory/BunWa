/**
 * Group MCP tools.
 *
 * The category existed in the tool descriptor from the start with no tools in
 * it, so an agent could send messages and read chats but could not touch a
 * group. These wrap the engine methods the REST group routes use, with the
 * same contract: participants are chat id strings (15551234567 or
 * 15551234567@c.us), and anything that changes membership or removes a group is
 * marked destructive so the per-session gate can hold it back.
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
const groupId = z
  .string()
  .min(1)
  .describe('Group id, as returned by GroupList (e.g. "123456789012345678@g.us")');
const participants = z
  .array(z.string())
  .min(1)
  .describe('Chat ids: 15551234567 or 15551234567@c.us');

async function getSession(manager: SessionManager, name: string) {
  return manager.getWorkingSession(name);
}

export function groupTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'GroupList',
      description: 'List the groups this session is a member of, keyed by group id.',
      tier: 'read',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getGroups({});
      },
    },
    {
      name: 'GroupGet',
      description:
        'Get one group: subject, description, invite link and participants with role and phone number. Answers 404 when the id is not a group this session is in.',
      tier: 'read',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getGroup(input.groupId);
      },
    },
    {
      name: 'GroupCreate',
      description:
        'Create a group and add the given participants. The session account becomes the owner. Use the safe number when testing.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        name: z.string().min(1).describe('Group subject'),
        participants,
      }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).createGroup({
          name: input.name,
          participants: input.participants,
        });
      },
    },
    {
      name: 'GroupGetParticipants',
      description: 'List a group members with their role (participant, admin, superadmin) and phone number when it is known.',
      tier: 'read',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).getGroupParticipants(input.groupId);
      },
    },
    {
      name: 'GroupAddParticipants',
      description: 'Add participants to a group. Requires admin rights in that group.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId, participants }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).addParticipants(input.groupId, {
          participants: input.participants,
        });
      },
    },
    {
      name: 'GroupRemoveParticipants',
      description: 'Remove participants from a group. They lose access immediately.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      destructive: true,
      inputSchema: z.object({ sessionId, groupId, participants }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).removeParticipants(input.groupId, {
          participants: input.participants,
        });
      },
    },
    {
      name: 'GroupPromoteParticipants',
      description: 'Promote participants to group admin.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId, participants }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).promoteParticipantsToAdmin(input.groupId, {
          participants: input.participants,
        });
      },
    },
    {
      name: 'GroupDemoteParticipants',
      description: 'Demote group admins back to participants.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId, participants }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return (session as any).demoteParticipantsToUser(input.groupId, {
          participants: input.participants,
        });
      },
    },
    {
      name: 'GroupSetSubject',
      description: 'Change the group subject (the name shown in the chat list).',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId, subject: z.string().min(1) }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).setSubject(input.groupId, input.subject);
        return { success: true };
      },
    },
    {
      name: 'GroupSetDescription',
      description: 'Change the group description shown on the group info screen.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId, description: z.string() }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).setDescription(input.groupId, input.description);
        return { success: true };
      },
    },
    {
      name: 'GroupGetInviteCode',
      description: 'Get the invite code that lets someone join this group.',
      tier: 'read',
      category: 'group',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, groupId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return { code: await (session as any).getInviteCode(input.groupId) };
      },
    },
    {
      name: 'GroupRevokeInviteCode',
      description:
        'Revoke the current invite code and return the new one, which invalidates every previously shared link.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      destructive: true,
      inputSchema: z.object({ sessionId, groupId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return { code: await (session as any).revokeInviteCode(input.groupId) };
      },
    },
    {
      name: 'GroupLeave',
      description: 'Leave the group. The session account stops receiving its messages.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      destructive: true,
      inputSchema: z.object({ sessionId, groupId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        await (session as any).leaveGroup(input.groupId);
        return { success: true };
      },
    },
    {
      name: 'GroupRefresh',
      description:
        'Drop the cached group list and reload it from WhatsApp. Use when a group change is not showing yet.',
      tier: 'write',
      category: 'group',
      sessionScoped: true,
      idempotent: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        const session = await getSession(manager, input.sessionId);
        return { success: await (session as any).refreshGroups() };
      },
    },
  ];
}

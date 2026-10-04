/**
 * Sending-policy MCP tools for BunWa.
 * Wraps the per-session anti-ban limits (REST: /api/sessions/:session/policy)
 * so an agent can inspect its own limits before a bulk send and, when the
 * session's MCP policy allows destructive operations, adjust them.
 */
import { z } from 'zod';
import { container } from 'tsyringe';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';
import {
  SendingPolicyService,
  parseOverrides,
} from '../../core/sending-policy/sending-policy.service';
import { NotFoundException } from '../../core/exceptions';

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

async function requireSession(manager: SessionManager, name: string): Promise<void> {
  if (!(await manager.exists(name))) {
    throw new NotFoundException(`Session ${name} not found`);
  }
}

const overrideFields = {
  maxPerMinute: z.number().min(0).nullable().optional()
    .describe('Max sends per rolling minute (0 blocks all sends)'),
  maxPerHour: z.number().min(0).nullable().optional()
    .describe('Max sends per rolling hour'),
  maxPerDay: z.number().min(0).nullable().optional()
    .describe('Max sends per rolling 24 hours'),
  newChatsPerDay: z.number().min(0).nullable().optional()
    .describe('Max first messages to never-contacted chats per day'),
  reachoutMinIntervalSeconds: z.number().min(0).nullable().optional()
    .describe('Minimum gap between cold-outreach first messages, in seconds'),
  warmupDays: z.number().min(0).nullable().optional()
    .describe('Warm-up ramp length in days (default 14)'),
  warmupFloorPercent: z.number().min(0).nullable().optional()
    .describe('Warm-up floor as a percent of the caps (default 20)'),
  quietHours: z.string().nullable().optional()
    .describe("'HH:MM-HH:MM' local quiet window; '' disables quiet hours"),
  enabled: z.boolean().nullable().optional()
    .describe('Master switch for the policy on this session'),
};

export function policyTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'SendingPolicyGet',
      description:
        'Get the anti-ban sending policy for a session: the per-session overrides, whether the session is bypassed, and live usage counters (sends per minute/hour/day, new chats, warm-up state, next allowed times).',
      tier: 'read',
      category: 'policy',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        await requireSession(manager, input.sessionId);
        const policy = container.resolve(SendingPolicyService);
        return {
          session: input.sessionId,
          bypassed: policy.isBypassed(input.sessionId),
          overrides: policy.getOverrides(input.sessionId),
          usage: policy.getUsage(input.sessionId),
        };
      },
    },
    {
      name: 'SendingPolicySet',
      description:
        'Replace the sending-policy overrides for a session. The supplied fields REPLACE all stored overrides: send every field you want to keep, or none to clear back to deployment defaults. Can weaken anti-ban protection, so it requires destructiveOps=true in the session MCP policy. Applies to REST, bulk and MCP sends alike.',
      tier: 'write',
      destructive: true,
      category: 'policy',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, ...overrideFields }),
      handler: async (input) => {
        await requireSession(manager, input.sessionId);
        const body: Record<string, unknown> = {};
        for (const key of Object.keys(overrideFields)) {
          const value = (input as Record<string, unknown>)[key];
          if (value !== undefined && value !== null) {
            body[key] = value;
          }
        }
        const overrides = parseOverrides(body);
        const policy = container.resolve(SendingPolicyService);
        policy.setOverrides(input.sessionId, overrides);
        return {
          session: input.sessionId,
          overrides: policy.getOverrides(input.sessionId),
          usage: policy.getUsage(input.sessionId),
        };
      },
    },
    {
      name: 'SendingPolicyUsage',
      description:
        'Get live sending-policy usage for a session: sliding-window counts, the effective caps in force (after warm-up scaling), warm-up state and when the next send becomes allowed.',
      tier: 'read',
      category: 'policy',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        await requireSession(manager, input.sessionId);
        const policy = container.resolve(SendingPolicyService);
        return {
          session: input.sessionId,
          bypassed: policy.isBypassed(input.sessionId),
          ...policy.getUsage(input.sessionId),
        };
      },
    },
  ];
}

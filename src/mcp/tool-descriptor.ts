/**
 * Tool descriptor — protocol-neutral definition of an agent-invocable capability.
 * No MCP types here; the MCP adapter reads these and wires them up.
 */
import type { z } from 'zod';

export type ToolTier = 'read' | 'write';

export type ToolCategory = 'session' | 'message' | 'chat' | 'contact' | 'group' | 'presence' | 'media';

export interface ToolDescriptor<I = any> {
  /** Explicit, stable public name, e.g. 'MessageSendText'. */
  name: string;
  /** Agent-legible description: what it does, when to use it, preconditions. */
  description: string;
  /** Input contract: validates the call AND is advertised to the agent. */
  inputSchema: z.ZodType<I>;
  tier: ToolTier;
  /** True for irreversible/dangerous ops. */
  destructive?: boolean;
  /** Safe to repeat without additional effect. Defaults to (tier === 'read'). */
  idempotent?: boolean;
  /** If true, input MUST carry `sessionId`. */
  sessionScoped?: boolean;
  /** Functional category for UI grouping and permission policies. */
  category?: ToolCategory;
  /** Result rendering hint for the MCP adapter. Default 'smart'. */
  resultDisposition?: 'json' | 'smart';
  /** Calls the service. Receives validated input. */
  handler: (input: I) => Promise<unknown>;
}

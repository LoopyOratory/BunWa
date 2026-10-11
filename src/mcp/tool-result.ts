/**
 * Tool result formatting for MCP responses.
 * No NestJS dependencies — uses plain Error classes.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import pino from 'pino';

const logger = pino({ name: 'Mcp' });

/**
 * Largest result returned, in bytes (MCP_MAX_RESULT_BYTES, default 16 MiB —
 * room for the media tools' 8 MiB default once base64-encoded). Above it the
 * call answers a clear error asking for a smaller request.
 */
export function maxResultBytes(): number {
  const configured = Number.parseInt(process.env.MCP_MAX_RESULT_BYTES ?? '', 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 16 * 1024 * 1024;
}

/**
 * Format a tool result as a single text block.
 *
 * Results over 4 KB used to be offloaded to an embedded base64 `resource`
 * under an mcp://toolResult/... URI the server never published. MCP clients
 * reject or cannot read that shape (Claude's client refused it with an invalid
 * `_meta` error), so any message-history page past two or three messages
 * failed. Every result is now plain text, which every client handles; tools
 * keep their payloads small instead (see ChatGetMessages' compact messages).
 */
export function smartToolResult(data: string | object | object[]): CallToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? null);
  const bytes = Buffer.byteLength(text);
  const limit = maxResultBytes();
  if (bytes > limit) {
    return jsonToolResult(
      {
        success: false,
        name: 'ResultTooLarge',
        message:
          `The result is ${bytes} bytes, over the ${limit}-byte limit for one tool call. ` +
          'Ask for less: a smaller limit or a later offset for message history, or a lower maxBytes for media.',
      },
      true,
    );
  }
  return { content: [{ type: 'text', text }] };
}

/** Format a tool result as compact JSON text. */
export function jsonToolResult(data: object, isError = false): CallToolResult {
  const result: CallToolResult = { content: [{ type: 'text', text: JSON.stringify(data) }] };
  if (isError) {
    result.isError = true;
  }
  return result;
}

/**
 * Map a thrown error to a tool-error result. Stack traces are logged
 * server-side only — never put on the wire to avoid leaking internals.
 */
export function handleToolError(error: unknown): CallToolResult {
  if (error instanceof Error) {
    logger.error({ err: error }, 'Tool error');
    const name = error.name || 'Error';
    const message = error.message || 'Internal error';
    return jsonToolResult({ success: false, name, message }, true);
  }
  logger.error({ raw: String(error) }, 'Unknown tool error');
  return jsonToolResult({ success: false, name: 'Unknown error', message: 'Internal error' }, true);
}

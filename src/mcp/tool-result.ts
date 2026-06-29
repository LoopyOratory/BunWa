/**
 * Tool result formatting for MCP responses.
 * No NestJS dependencies — uses plain Error classes.
 */
import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import pino from 'pino';

const logger = pino({ name: 'Mcp' });

/**
 * Format a tool result, inlining small payloads as text and offloading large
 * ones (> 4 KB) to an embedded base64 resource so the response stays compact.
 */
export function smartToolResult(data: string | object | object[]): CallToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  const mimeType = typeof data === 'string' ? 'text/plain' : 'application/json';
  const ext = typeof data === 'string' ? 'txt' : 'json';
  if (text.length > 4096) {
    const uri = `mcp://toolResult/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(text);
    return {
      content: [
        { type: 'text', text: `Received resource ${uri} with ${buffer.byteLength} bytes` },
        { type: 'resource', resource: { uri, mimeType, blob: buffer.toString('base64') } },
      ],
    };
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

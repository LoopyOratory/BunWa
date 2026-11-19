/**
 * External MCP client — connects BunWa to third-party MCP servers.
 *
 * BunWa is itself an MCP server for agents; this module is the client half
 * that lets the admin plug additional MCP servers (Notion, GitHub, internal
 * tools, anything speaking the protocol) into the same tool catalogue.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ExternalMcpServer, UpsertExternalMcpToolInput } from '../core/agent/agent.types';

function transportFor(server: ExternalMcpServer): StreamableHTTPClientTransport {
  return new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...server.headers,
      },
    },
  });
}

function clientFor(server: ExternalMcpServer): Client {
  return new Client(
    { name: `bunwa-external-${server.name}`, version: '0.1.0' },
    { capabilities: {} },
  );
}

/** Connect, run one action, and always close the transport. */
async function withClient<T>(server: ExternalMcpServer, run: (client: Client) => Promise<T>): Promise<T> {
  const transport = transportFor(server);
  const client = clientFor(server);
  try {
    await client.connect(transport);
    return await run(client);
  } finally {
    try {
      await client.close();
    } catch {
      // The server may already be gone; closing is best effort.
    }
  }
}

/** Fetch the tool list from a remote MCP server. */
export async function listExternalServerTools(server: ExternalMcpServer): Promise<UpsertExternalMcpToolInput[]> {
  return withClient(server, async (client) => {
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? {},
      annotations: {
        readOnlyHint: tool.annotations?.readOnlyHint ?? undefined,
        destructiveHint: tool.annotations?.destructiveHint ?? undefined,
        idempotentHint: tool.annotations?.idempotentHint ?? undefined,
      },
      tier: tool.annotations?.readOnlyHint === false ? 'write' : 'read',
      destructive: tool.annotations?.destructiveHint === true,
    }));
  });
}

/** Call one tool on a remote MCP server and return the raw result. */
export async function callExternalServerTool(
  server: ExternalMcpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withClient(server, async (client) => {
    const result = (await client.callTool({ name: toolName, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    // Unwrap text results so the local server's `smartToolResult` does not
    // double-wrap them. Non-text content (images, audio) is passed through.
    const content = result?.content;
    if (Array.isArray(content) && content.length > 0 && content.every((part) => part?.type === 'text' && typeof part.text === 'string')) {
      return content.map((part) => part.text).join('\n');
    }
    return result as unknown;
  });
}

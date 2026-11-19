/**
 * External MCP tool naming.
 *
 * A remote server may expose a tool called `search`, and another may expose the
 * same name. BunWa also has its own tools. Prefixing with a stable server id
 * keeps every advertised name unique without relying on a mutable server name.
 */
export function externalToolQualifiedName(serverId: string, remoteName: string): string {
  const serverKey = serverId.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'server';
  const toolKey =
    remoteName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_')
      .slice(0, 40) || 'tool';
  return `ext__${serverKey}__${toolKey}`.slice(0, 64);
}

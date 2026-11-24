/**
 * One policy for unauthenticated access.
 *
 * Keyless access is **opt-in**: a deployment that forgot to set an API key must
 * not silently expose the REST API or the MCP tool surface. The previous
 * default (`BUNWA_ALLOW_NO_AUTH !== 'false'`) did exactly that — the switch had
 * to be set explicitly to be safe, which is the wrong direction for a security
 * default.
 *
 * Development and tests opt in with `BUNWA_ALLOW_NO_AUTH=true`.
 */
export function isNoAuthAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.BUNWA_ALLOW_NO_AUTH === 'true';
}

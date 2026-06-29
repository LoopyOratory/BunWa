import { Agent } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { Agents } from './engines/noweb/types';

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Create http(s).Agent instances that route traffic through the given proxy.
 *
 * Supports proxy URL schemes:
 *   http://...   → HTTP CONNECT proxy (via HttpsProxyAgent)
 *   https://..   → HTTPS CONNECT proxy (via HttpsProxyAgent)
 *   socks4://..  → SOCKS4 proxy (via SocksProxyAgent)
 *   socks5://..  → SOCKS5 proxy (via SocksProxyAgent)
 *
 * If username/password are provided separately (ProxyConfig fields), they
 * are embedded into the URL before creating the agent so the proxy auth
 * handshake works transparently.
 */
export function createAgentProxy(config: ProxyConfig): Agents | undefined {
  if (!config?.server) {
    return undefined;
  }

  const url = buildProxyUrl(config);
  const agent = createProxyAgent(url);
  if (!agent) {
    return undefined;
  }

  // Return object matching Agents shape (socket + fetch)
  return { socket: agent, fetch: agent };
}

/**
 * Build a full proxy URL string from the ProxyConfig, embedding credentials
 * into the URL if they were provided as separate fields.
 */
function buildProxyUrl(config: ProxyConfig): string {
  let urlStr = config.server;

  // If credentials were provided outside the URL, embed them
  if (config.username && config.password) {
    try {
      const parsed = new URL(urlStr);
      parsed.username = config.username;
      parsed.password = config.password;
      urlStr = parsed.toString();
    } catch {
      // server wasn't a valid URL — leave as-is (will fail downstream)
    }
  }

  return urlStr;
}

/**
 * Determine the proxy type from the URL scheme and create the matching agent.
 */
function createProxyAgent(url: string): Agent | undefined {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    return undefined;
  }

  switch (protocol) {
    case 'http:':
    case 'https:':
      return new HttpsProxyAgent(url) as unknown as Agent;
    case 'socks4:':
    case 'socks5:':
      return new SocksProxyAgent(url) as unknown as Agent;
    default:
      return undefined;
  }
}

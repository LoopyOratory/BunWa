export class NowebConfig {
  store?: {
    enabled?: boolean;
    fullSync?: boolean;
  };
  markOnline?: boolean;
}

export class GowsConfig {
  storage?: {
    messages?: boolean;
    groups?: boolean;
    chats?: boolean;
    labels?: boolean;
  };
}

export class WebjsConfig {
  tagsEventsOn?: boolean;
  authTimeout?: number;
}

export class ClientSessionConfig {
  deviceName?: string;
  browserName?: string;
}

export class ProxyConfig {
  server!: string;
  username?: string;
  password?: string;
}

export class IgnoreConfig {
  status?: boolean;
  groups?: boolean;
  channels?: boolean;
  broadcast?: boolean;
}

import type { WebhookFilters } from '../common/security/webhook-filters';

export class WebhookConfig {
  id?: string;
  enabled?: boolean;
  method?: string;
  url!: string;
  events!: string[];
  hmac?: {
    key?: string;
  };
  retries?: {
    attempts?: number;
    delaySeconds?: number;
    policy?: string;
  };
  customHeaders?: Array<{
    name: string;
    value: string;
  }>;
  filters?: WebhookFilters;
}

export class McpConfig {
  enabled?: boolean;
  allowedTools?: string[];
  deniedTools?: string[];
  destructiveOps?: boolean;
  apiKeyHash?: string;  // SHA-256 of per-session MCP key (sk_mcp_...)
}

export class SessionConfig {
  webhooks?: WebhookConfig[];
  metadata?: Record<string, any>;
  engine?: string;
  /** Auto-start this session when the server boots. */
  autoStart?: boolean;
  proxy?: ProxyConfig;
  debug?: {
    mode?: boolean;
  };
  ignore?: IgnoreConfig;
  client?: ClientSessionConfig;
  noweb?: NowebConfig;
  gows?: GowsConfig;
  webjs?: WebjsConfig;
  mcp?: McpConfig;
}

export class MeInfo {
  id!: string;
  lid?: string;
  jid?: string;
  pushName?: string;
}

export class SessionDTO {
  name!: string;
  status!: string;
  config?: SessionConfig;
}

export class SessionInfo extends SessionDTO {
  me?: MeInfo;
  assignedWorker?: string;
  presence?: any;
  timestamps!: {
    activity?: number;
  };
}

export class SessionDetailedInfo extends SessionInfo {
  engine?: string;
}

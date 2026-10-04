/**
 * OpenAPI route coverage.
 *
 * The spec in `src/swagger.ts` is written by hand, so it drifts: at the time
 * this module was added the code had 185 routes and the spec documented 111.
 * Every route the spec does not describe is now filled in from the mounted
 * route table, with a curated summary where one is written below and a derived
 * one otherwise, and `route-coverage.test.ts` fails when a route is missing so
 * the gap cannot reopen.
 *
 * This fills documentation; it does not invent behaviour. Where a route is a
 * stub or refuses on an engine, the curated entry says so.
 */

export interface RouteLike {
  method: string;
  path: string;
}

interface RouteDoc {
  summary: string;
  tag: string;
  /** Request body properties, when the route takes one. */
  body?: Record<string, unknown>;
  /** Extra responses beyond the default 200. */
  responses?: Record<string, { description: string }>;
}

export const TAGS = {
  groups: '👥 Groups',
  channels: '📢 Channels',
  chats: '💬 Chats',
  chatting: '📤 Chatting',
  sessions: '🖥️ Sessions',
  server: '🖥️ Server',
  infra: '🏗️ Infrastructure',
  templates: '🧩 Templates',
  policy: '🛡️ Sending policy',
  apiKeys: '🔑 API keys',
  webhooks: '🪝 Webhooks',
  mcp: '🤖 MCP',
  media: '🖼️ Media',
  apps: '🧩 Apps',
  audit: '🔍 Observability',
} as const;

/** Convert a Hono path (`:param`) to an OpenAPI path (`{param}`). */
export function openApiPath(honoPath: string): string {
  return honoPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

const sessionParam = {
  name: 'session',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' },
};

/** Curated documentation, keyed by `METHOD /api/{session}/...`. */
export const CURATED: Record<string, RouteDoc> = {
  // --- Chats ---
  'GET /api/{session}/chats/{chatId}': {
    summary: 'Get one chat by id',
    tag: TAGS.chats,
    responses: { '404': { description: 'No such chat' } },
  },
  'POST /api/{session}/chats/overview': {
    summary: 'List chats with their last message (paginated overview)',
    tag: TAGS.chats,
    body: {
      limit: { type: 'number' },
      offset: { type: 'number' },
      ids: { type: 'array', items: { type: 'string' } },
    },
  },
  'POST /api/{session}/chats/{chatId}/read': {
    summary: 'Mark every unread message in a chat as read',
    tag: TAGS.chats,
  },
  'POST /api/{session}/chats/{chatId}/mute': {
    summary: 'Mute a chat (not implemented by any engine yet, answers 400 naming the engine)',
    tag: TAGS.chats,
  },
  'POST /api/{session}/chats/{chatId}/unmute': {
    summary: 'Unmute a chat (not implemented by any engine yet, answers 400 naming the engine)',
    tag: TAGS.chats,
  },
  'GET /api/{session}/chats/{chatId}/messages/{messageId}/media': {
    summary: 'Download the media attached to one message',
    tag: TAGS.chats,
    responses: { '404': { description: 'Message or media not found' } },
  },
  'GET /api/{session}/chats/{chatId}/messages/{messageId}/reactions': {
    summary: 'List the reactions on one message',
    tag: TAGS.chats,
  },
  'GET /api/messages': {
    summary: 'Read stored messages without naming a session in the path',
    tag: TAGS.chats,
  },
  'POST /api/{session}/events': {
    summary: 'Emit a custom event on the session WebSocket stream',
    tag: TAGS.chats,
    body: { event: { type: 'string' }, payload: { type: 'object' } },
  },
  'GET /api/{session}/screenshot': {
    summary: 'Screenshot the engine browser (WEBJS only, answers 422 naming the engine on NOWEB)',
    tag: TAGS.chats,
  },

  // --- Messages ---
  'POST /api/sendSticker': {
    summary: 'Send a sticker',
    tag: TAGS.chatting,
    body: {
      session: { type: 'string' },
      chatId: { type: 'string' },
      file: { type: 'object', description: 'A file object, data URL, base64 string or URL' },
    },
  },
  'POST /api/send/buttons/reply': {
    summary: 'Send a reply to a button tap (accepted, sends nothing)',
    tag: TAGS.chatting,
  },
  'POST /api/send/link-custom-preview': {
    summary: 'Send a link with a custom preview',
    tag: TAGS.chatting,
    body: {
      session: { type: 'string' },
      chatId: { type: 'string' },
      url: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      picture: { type: 'object' },
    },
  },
  'POST /api/{session}/messages/send-bulk': {
    summary: 'Send one message to many chats as a batch',
    tag: TAGS.chatting,
    body: {
      chatIds: { type: 'array', items: { type: 'string' } },
      text: { type: 'string' },
      file: { type: 'object' },
    },
  },
  'GET /api/{session}/messages/batch/{batchId}': {
    summary: 'Get the status of a bulk send batch',
    tag: TAGS.chatting,
  },
  'POST /api/{session}/messages/batch/{batchId}/cancel': {
    summary: 'Cancel the remaining sends in a batch',
    tag: TAGS.chatting,
  },
  'POST /api/{session}/media/convert/voice': {
    summary: 'Convert an audio file to an OGG/Opus voice note',
    tag: TAGS.media,
    body: {
      url: { type: 'string' },
      data: { type: 'string' },
      mimetype: { type: 'string' },
    },
  },
  'POST /api/{session}/media/convert/video': {
    summary: 'Convert a video (not implemented, answers 422)',
    tag: TAGS.media,
  },

  // --- Groups ---
  'GET /api/{session}/groups/count': {
    summary: 'Count the groups this session is a member of',
    tag: TAGS.groups,
  },
  'GET /api/{session}/groups/join-info': {
    summary: 'Preview a group from an invite code without joining',
    tag: TAGS.groups,
  },
  'POST /api/{session}/groups/join': {
    summary: 'Join a group with an invite code',
    tag: TAGS.groups,
    body: { code: { type: 'string' } },
  },
  'POST /api/{session}/groups/refresh': {
    summary: 'Drop the cached group list and reload it from WhatsApp',
    tag: TAGS.groups,
  },
  'DELETE /api/{session}/groups/{id}': {
    summary: 'Leave a group and clear it from the local store',
    tag: TAGS.groups,
  },
  'GET /api/{session}/groups/{id}/participants/v2': {
    summary: 'List participants in the engine native shape',
    tag: TAGS.groups,
  },
  'POST /api/{session}/groups/{id}/admin/promote': {
    summary: 'Promote participants to admin',
    tag: TAGS.groups,
    body: {
      participants: {
        type: 'array',
        items: { type: 'string' },
        description: 'Chat ids: 15551234567 or 15551234567@c.us',
      },
    },
  },
  'POST /api/{session}/groups/{id}/admin/demote': {
    summary: 'Demote group admins to participants',
    tag: TAGS.groups,
    body: {
      participants: { type: 'array', items: { type: 'string' } },
    },
  },
  'GET /api/{session}/groups/{id}/settings/security/info-admin-only': {
    summary: 'Read whether only admins may edit group info',
    tag: TAGS.groups,
  },
  'PUT /api/{session}/groups/{id}/settings/security/info-admin-only': {
    summary: 'Restrict group info editing to admins',
    tag: TAGS.groups,
    body: { adminsOnly: { type: 'boolean' } },
  },
  'GET /api/{session}/groups/{id}/settings/security/messages-admin-only': {
    summary: 'Read whether only admins may send messages',
    tag: TAGS.groups,
  },
  'PUT /api/{session}/groups/{id}/settings/security/messages-admin-only': {
    summary: 'Restrict sending to admins',
    tag: TAGS.groups,
    body: { adminsOnly: { type: 'boolean' } },
  },
  'POST /api/{session}/groups/{id}/invite-code/revoke': {
    summary: 'Revoke the invite code and return the new one',
    tag: TAGS.groups,
  },
  'GET /api/{session}/groups/{id}/picture': {
    summary: 'Get the group picture (stub, returns {url: null})',
    tag: TAGS.groups,
  },
  'PUT /api/{session}/groups/{id}/picture': {
    summary: 'Set the group picture',
    tag: TAGS.groups,
    body: { file: { type: 'object' } },
  },
  'DELETE /api/{session}/groups/{id}/picture': {
    summary: 'Remove the group picture',
    tag: TAGS.groups,
  },

  // --- Channels ---
  'GET /api/{session}/channels/search/views': {
    summary: 'List channel directory views (stub, returns an empty list)',
    tag: TAGS.channels,
  },
  'GET /api/{session}/channels/search/countries': {
    summary: 'List channel directory countries (stub, returns an empty list)',
    tag: TAGS.channels,
  },
  'GET /api/{session}/channels/search/categories': {
    summary: 'List channel directory categories (stub, returns an empty list)',
    tag: TAGS.channels,
  },
  'GET /api/{session}/channels/{id}/messages/preview': {
    summary: 'Preview recent posts from a channel',
    tag: TAGS.channels,
  },

  // --- Sessions, config and credentials ---
  'GET /api/sessions/{session}/config': {
    summary: 'Read a session configuration',
    tag: TAGS.sessions,
  },
  'PATCH /api/sessions/{session}/config': {
    summary: 'Update a session configuration',
    tag: TAGS.sessions,
    body: {
      webhooks: { type: 'array', items: { type: 'object' } },
      noweb: { type: 'object' },
      debug: { type: 'object' },
      metadata: { type: 'object' },
    },
  },
  'POST /api/sessions/{session}/force-kill': {
    summary: 'Kill the session process without a graceful stop',
    tag: TAGS.sessions,
  },
  'GET /api/sessions/{session}/api-keys': {
    summary: 'List the REST API keys scoped to this session (hashes and prefixes only)',
    tag: TAGS.apiKeys,
  },
  'POST /api/sessions/{session}/api-keys': {
    summary: 'Create a REST API key scoped to this session, with an optional action allowlist',
    tag: TAGS.apiKeys,
    body: {
      name: { type: 'string' },
      actions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Allowlisted actions; empty means every action the session allows',
      },
    },
  },
  'DELETE /api/sessions/{session}/api-keys/{id}': {
    summary: 'Revoke a session REST API key',
    tag: TAGS.apiKeys,
  },
  'POST /api/sessions/{session}/api-keys/{id}/rotate': {
    summary: 'Rotate a session REST API key, returning the new secret once',
    tag: TAGS.apiKeys,
  },
  'GET /api/sessions/{session}/mcp': {
    summary: 'Read the MCP configuration for this session (tools policy and key hash)',
    tag: TAGS.mcp,
  },
  'PUT /api/sessions/{session}/mcp': {
    summary: 'Update the MCP configuration: enabled, read-only, allowed and denied tools, destructive operations',
    tag: TAGS.mcp,
    body: {
      enabled: { type: 'boolean' },
      destructiveOps: { type: 'boolean' },
      allowedTools: { type: 'array', items: { type: 'string' } },
      deniedTools: { type: 'array', items: { type: 'string' } },
    },
  },
  'POST /api/sessions/{session}/mcp/generate-key': {
    summary: 'Generate a session MCP key, returned once',
    tag: TAGS.mcp,
  },
  'GET /api/mcp/tools': {
    summary: 'List every MCP tool with its tier, category and destructive flag',
    tag: TAGS.mcp,
  },
  'GET /api/sessions/{session}/policy': {
    summary: 'Read the anti-ban sending policy for this session',
    tag: TAGS.policy,
  },
  'PUT /api/sessions/{session}/policy': {
    summary: 'Update the sending policy: per minute, hourly and daily caps, quiet hours, warm-up',
    tag: TAGS.policy,
    body: {
      enabled: { type: 'boolean' },
      maxPerMinute: { type: 'number' },
      maxPerHour: { type: 'number' },
      maxPerDay: { type: 'number' },
      quietHours: { type: 'object' },
    },
  },
  'GET /api/sessions/{session}/policy/usage': {
    summary: 'Read the current sending usage against the policy windows',
    tag: TAGS.policy,
  },
  'GET /api/sessions/{session}/templates': {
    summary: 'List message templates stored for this session',
    tag: TAGS.templates,
  },
  'POST /api/sessions/{session}/templates': {
    summary: 'Create a message template',
    tag: TAGS.templates,
    body: {
      name: { type: 'string' },
      body: { type: 'string', description: 'Template text with {{variables}}' },
      variables: { type: 'array', items: { type: 'string' } },
    },
  },
  'GET /api/sessions/{session}/templates/{id}': {
    summary: 'Get one template by id or name',
    tag: TAGS.templates,
  },
  'PUT /api/sessions/{session}/templates/{id}': {
    summary: 'Update a template',
    tag: TAGS.templates,
    body: {
      name: { type: 'string' },
      body: { type: 'string' },
      variables: { type: 'array', items: { type: 'string' } },
    },
  },
  'DELETE /api/sessions/{session}/templates/{id}': {
    summary: 'Delete a template',
    tag: TAGS.templates,
  },
  'POST /api/sessions/{session}/templates/{id}/preview': {
    summary: 'Render a template with values, without sending it',
    tag: TAGS.templates,
    body: { variables: { type: 'object' } },
  },
  'POST /api/sessions/{session}/templates/{id}/send': {
    summary: 'Render a template and send it to a chat',
    tag: TAGS.templates,
    body: {
      chatId: { type: 'string' },
      variables: { type: 'object' },
    },
  },
  'GET /api/sessions/{session}/webhooks': {
    summary: 'List the webhooks configured for this session',
    tag: TAGS.webhooks,
  },
  'POST /api/sessions/{session}/webhooks': {
    summary: 'Add a webhook, with events, filters and an optional HMAC secret',
    tag: TAGS.webhooks,
    body: {
      url: { type: 'string' },
      events: { type: 'array', items: { type: 'string' } },
      hmac: { type: 'object' },
      retries: { type: 'object' },
      customHeaders: { type: 'object' },
    },
  },
  'PUT /api/sessions/{session}/webhooks/{id}': {
    summary: 'Update a webhook',
    tag: TAGS.webhooks,
  },
  'DELETE /api/sessions/{session}/webhooks/{id}': {
    summary: 'Delete a webhook',
    tag: TAGS.webhooks,
  },
  'POST /api/sessions/{session}/webhooks/{id}/test': {
    summary: 'Send a test delivery to a webhook',
    tag: TAGS.webhooks,
  },

  // --- Server, infrastructure, apps, audit ---
  'GET /api/server/status': {
    summary: 'Server status: uptime, memory, sessions',
    tag: TAGS.server,
  },
  'GET /api/server/version': {
    summary: 'Server version and engine',
    tag: TAGS.server,
  },
  'GET /api/server/environment': {
    summary: 'Resolved environment: storage driver, engine, tier, paths',
    tag: TAGS.server,
  },
  'POST /api/server/stop': {
    summary: 'Stop the server process',
    tag: TAGS.server,
  },
  'GET /api/infra/config': {
    summary: 'Read the infrastructure configuration as the process resolved it',
    tag: TAGS.infra,
  },
  'PUT /api/infra/config': {
    summary: 'Update the infrastructure configuration (rewrites the environment file)',
    tag: TAGS.infra,
    body: { config: { type: 'object' } },
  },
  'POST /api/infra/database/test': {
    summary: 'Test the configured database connection',
    tag: TAGS.infra,
  },
  'POST /api/infra/restart': {
    summary: 'Restart the server process',
    tag: TAGS.infra,
  },
  'GET /api/apps/chatwoot/locales': {
    summary: 'List the locales a Chatwoot app can be configured with',
    tag: TAGS.apps,
  },
  'GET /api/audit': {
    summary: 'Read the audit log, newest first, with optional filters',
    tag: TAGS.audit,
  },
};

/** Fallback summaries for the long tail: derived from the path, never invented. */
function deriveSummary(method: string, path: string): string {
  const segments = path
    .replace(/^\/api\/?/, '')
    .replace(/^:session\/?/, '')
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(':'));
  const tail = segments.join(' ');
  const verb =
    method === 'GET'
      ? 'Get'
      : method === 'POST'
        ? 'Create or act on'
        : method === 'PUT'
          ? 'Replace'
          : method === 'PATCH'
            ? 'Update'
            : 'Delete';
  return `${verb} ${tail || 'the resource'}`.replace(/\s+/g, ' ');
}

function deriveTag(path: string): string {
  const segment = path.split('/').filter(Boolean)[2] ?? '';
  const map: Record<string, string> = {
    groups: TAGS.groups,
    channels: TAGS.channels,
    chats: TAGS.chats,
    sessions: TAGS.sessions,
    templates: TAGS.templates,
    policy: TAGS.policy,
    webhooks: TAGS.webhooks,
    mcp: TAGS.mcp,
    media: TAGS.media,
    apps: TAGS.apps,
    audit: TAGS.audit,
    infra: TAGS.infra,
    server: TAGS.server,
  };
  return map[segment] ?? TAGS.chats;
}

function operationId(method: string, path: string): string {
  const parts = path
    .replace(/^\/api\/?/, '')
    // {session} is implied by every session-scoped route, so it does not belong
    // in the id; other parameters become By<Param> with a capitalised name.
    .replace(/^sessions\/\{session\}\/?/, '')
    .replace(/^:session\/?/, '')
    .replace(/\{session\}\/?/, '')
    .replace(/\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => `By ${name}`)
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^A-Za-z0-9]/g, ' '));
  const camel = parts
    .join(' ')
    .split(' ')
    .filter(Boolean)
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join('');
  return `${method.toLowerCase()}${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

function parametersFor(path: string): Array<Record<string, unknown>> {
  const params: Array<Record<string, unknown>> = [];
  if (path.includes('{session}')) {
    params.push(sessionParam);
  }
  for (const match of path.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    if (match[1] === 'session') continue;
    params.push({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    });
  }
  return params;
}

function buildOperation(method: string, path: string, doc: RouteDoc): Record<string, unknown> {
  const operation: Record<string, unknown> = {
    tags: [doc.tag],
    summary: doc.summary,
    operationId: operationId(method, path),
    security: [{ apiKey: [] }],
  };
  const parameters = parametersFor(path);
  if (parameters.length) {
    operation.parameters = parameters;
  }
  if (doc.body) {
    operation.requestBody = {
      content: {
        'application/json': {
          schema: { type: 'object', properties: doc.body },
        },
      },
    };
  }
  operation.responses = {
    '200': { description: 'Successful response' },
    ...(doc.responses ?? {}),
  };
  return operation;
}

/**
 * Add an operation for every route the spec does not already document.
 * Existing (hand-written) entries are never touched.
 */
export function applyRouteCoverage(spec: any, routes: RouteLike[]): any {
  spec.paths = spec.paths ?? {};
  for (const route of routes) {
    const method = route.method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
    const path = openApiPath(route.path);
    const key = `${method} ${path}`;
    const doc = CURATED[key] ?? {
      summary: deriveSummary(method, route.path),
      tag: deriveTag(route.path),
    };
    const entry = (spec.paths[path] = spec.paths[path] ?? {});
    if (entry[method.toLowerCase()]) continue;
    entry[method.toLowerCase()] = buildOperation(method, path, doc);
  }
  return spec;
}

/** Routes in the table that the spec does not describe. Used by the drift test. */
export function undocumentedRoutes(spec: any, routes: RouteLike[]): string[] {
  const missing: string[] = [];
  for (const route of routes) {
    const method = route.method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) continue;
    const path = openApiPath(route.path);
    const entry = spec.paths?.[path];
    if (!entry || !entry[method.toLowerCase()]) {
      missing.push(`${method} ${path}`);
    }
  }
  return missing;
}

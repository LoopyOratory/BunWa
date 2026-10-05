---
type: feature
status: shipped
engine: [any]
tier: both
endpoints: 4
tags: [feature, mcp, ai]
updated: 2026-09-14
source: src/mcp/, src/api/mcp-config.routes.ts
---

# 🤖 MCP Server

BunWa exposes WhatsApp as a **Model Context Protocol** server, so an AI agent (Claude Desktop,
Zed, any MCP host) can send messages, manage sessions and inspect chats through a standard tool
interface. **80 tools.** Upstream OpenWA has no MCP surface at all — this is a fork-only feature.

SDK: `@modelcontextprotocol/sdk` ^1.29.0. Tools are registered with `McpServer.registerTool`, with
each descriptor's Zod schema passed straight through.

## Transports

| Transport | Details |
|---|---|
| **HTTP** — `POST /mcp` | `WebStandardStreamableHTTPServerTransport`, **stateless** (`sessionIdGenerator: undefined`): a fresh `McpServer` + transport per request, no session map. Base path configurable, default `/mcp` |
| **stdio** — `src/mcp/stdio.ts` | subprocess entry for hosts that spawn a command; registers the full registry and auto-scopes `sessionId` |

Server identity: HTTP `waha-bun` / stdio `bunwa`, both version `1.0.0`.

Mounting: `createMcpRouter(sessionManager)` is mounted at `/` in `main.ts` and is **excluded from the
dashboard static fallback**. `/mcp` does not go through the Hono `/api/*` middleware, so the API rate
limiter does not apply — MCP has its own (below).

## Authentication

```text
x-api-key: <key>      or      Authorization: Bearer <key>
```

Two kinds of key:

| Key | Scope |
|---|---|
| `WAHA_API_KEY` (global) | timing-safe compare; full access (subject to the session's MCP policy). With no global key the endpoint is open unless `WAHA_ALLOW_NO_AUTH=false` — the same fail-closed switch the REST API honors; boot logs a loud warning while it is keyless. `MCP_ENABLED=false` unmounts it entirely (404) |
| Per-session key `sk_mcp_<32 hex>` | minted by `POST /api/sessions/:session/mcp/generate-key`; only the **SHA-256 hash** is stored (`SessionConfig.mcp.apiKeyHash`), plaintext is shown once. Binds every call to that session |

**Scoping rules** for per-session keys:

- `sessionId` is forced to the key's session on `sessionScoped` tools (99 % of the registry).
- `sessionId` is **optional** in every tool schema, so a keyed client can call a tool with no
  arguments at all; the key supplies the session. It used to be required, and because the MCP SDK
  validates input before the server can inject the scoped session, a keyed call with no arguments
  came back as `Input validation error: expected string` instead of data. Fixed 2026-10-04.
- Calling a **non**-session-scoped tool (e.g. `SessionList`) with a per-session key is denied.
- A `sessionId` naming a different session is accepted by validation and then overridden, so a key
  can never read another session even if the caller asks for one.
- Destructive tools stay refused while the session's `destructiveOps` is false, for both key kinds.
- stdio auth (`BUNWA_SESSION` + `BUNWA_MCP_KEY`) verifies the same hash and exits non-zero if invalid.
- One key hash per session: generating a new key **invalidates the previous one**, so a client
  holding the old key must be updated from the session's MCP tab.

## Security posture (verified live 2026-10-04)

| Property | How it holds |
|---|---|
| **Audit trail** | Every write-tier tool call is recorded as `mcp_tool_called` (or `mcp_tool_failed` with the error) with the session, the tool, the category, whether it was destructive and which credential kind was used. Before this, the MCP called engine methods directly and an agent could send messages, change a group or delete a status with no trace: the REST routes audit through `sendAndAudit`, the MCP path did not. Reads are not audited, matching REST. |
| **No secret material in responses** | `SessionGet` returned the session config verbatim, including `mcp.apiKeyHash` and every `restApiKeys[].keyHash`. It now applies the same `redactSessionSecrets` the REST routes use, so a scoped key reading its own session gets `enabled` and `destructiveOps` but no hashes. |
| **Scoping** | A session key is refused non-session-scoped tools (`SessionList`) and a `sessionId` naming another session is overridden, verified against both the local and production servers. |
| **Destructive gate** | All seven destructive tools are refused while the session's `destructiveOps` is false, for both key kinds. |
| **Read-only mode** | `MCP_READONLY=true` registers only `tier: read` tools, so the media and group write tools are absent rather than merely refused. |
| **Sending policy** | Send tools go through the engine's `policyGate`, so a 429 with `Retry-After` applies to an agent exactly as it does to REST. Observed live. |
| **SSRF** | Media sent by URL and audio converted from a URL both fetch through `resolveAndPinFetch`, the same guard webhooks use. |
| **Rate limit** | Per key, `MCP_RATE_LIMIT_MAX` (default 60) per window. |
| **Fail closed** | With no `WAHA_API_KEY`, the endpoint is open unless `WAHA_ALLOW_NO_AUTH=false`, which closes it; boot warns loudly while keyless. |

Not exposed on purpose, because they widen an agent's blast radius: session REST API key management, webhook management, session config writes, audit reads and the Chatwoot app. If an agent needs one of those, the REST API with the global key is the intended path.

## Rate limiting

In-memory sliding window **per key**: `MCP_RATE_LIMIT_MAX` (default 60) per
`MCP_RATE_LIMIT_WINDOW_MS` (default 60000). Exceeding it returns a JSON-RPC error with HTTP 429.
`MCP_READONLY=true` filters the registry down to `tier: 'read'` tools.

## Per-session policy

`SessionConfig.mcp` (`McpConfig`):

```ts
{ enabled?: boolean,
  allowedTools?: string[],   // allow-list; names OR categories; empty = allow all
  deniedTools?: string[],    // deny-list; names OR categories — DENY WINS
  destructiveOps?: boolean,  // required to run tools marked destructive (StatusDelete)
  apiKeyHash?: string }
```

Enforcement lives in `isToolAllowed()` (`mcp.server.ts`): disabled session ⇒ deny; deny-list match ⇒
deny; destructive tool without `destructiveOps` ⇒ deny; non-empty allow-list ⇒ allow only matches.

Manage it over REST:

| Endpoint | Purpose |
|---|---|
| `GET /api/mcp/tools` | full registry + `byCategory` grouping — hand this to an agent's prompt |
| `GET /api/sessions/:session/mcp` | current policy |
| `PUT /api/sessions/:session/mcp` | set policy |
| `POST /api/sessions/:session/mcp/generate-key` | mint a session key; returns plaintext + connection configs for HTTP and stdio |

Dashboard equivalent: **Session settings → MCP Tools** ([[Dashboard]]).

## Tool plumbing

- **Registry** (`tool-registry.service.ts`) — `ToolDescriptor`s; the constructor **throws on duplicate
  tool names**, so a name collision fails fast at boot.
- **Descriptor** — `name`, `description`, `inputSchema` (Zod), `tier: 'read' | 'write'`,
  `destructive?`, `idempotent?`, `sessionScoped?`, `category?`, `resultDisposition`, `handler`.
  MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) are derived from these.
- **Results** (`tool-result.ts`) — `smartToolResult` inlines text payloads under **4 KB** and wraps
  larger ones in a `resource` with a base64 blob; `jsonToolResult` for compact JSON. Errors never leak
  stack traces.

## Connecting

```jsonc
// Claude Desktop / any MCP host — HTTP
{ "mcpServers": { "bunwa": {
    "url": "http://localhost:3000/mcp",
    "headers": { "x-api-key": "<WAHA_API_KEY>" } } } }

// stdio (per-session key)
{ "mcpServers": { "bunwa": {
    "command": "bun", "args": ["run", "/path/to/src/mcp/stdio.ts"],
    "env": { "BUNWA_SESSION": "default", "BUNWA_MCP_KEY": "sk_mcp_…" } } } }
```

`POST /api/sessions/:session/mcp/generate-key` returns ready-made config blocks for both.

## Related

[[MCP Tools Reference]] · [[Security Model]] · [[Messaging]] · [[Dashboard]] · [[Configuration Reference]]

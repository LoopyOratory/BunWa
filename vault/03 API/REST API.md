---
type: note
section: api
tags: [bunwa, api, architecture]
updated: 2026-09-14
source: src/api/index.ts, src/main.ts
status: shipped
endpoints: 175
---

# 📡 REST API

**29 route modules**, **175 route definitions** (`GET` 67 · `POST` 76 · `PUT` 19 · `DELETE` 12 · `PATCH` 1),
of which **173 are reachable** — two routes in `contacts.session.routes.ts` are imported but never mounted.
Plus the MCP endpoint and two Chatwoot webhook routes, the process exposes ~176 HTTP operations.

## Mounting

`src/api/index.ts` builds one Hono router; `src/main.ts` mounts it at `/`:

```ts
const apiRouter = createApiRouter();
app.route('/', apiRouter);
app.route('/webhook/chatwoot', createChatwootWebhookRouter(...));
app.route('/', createMcpRouter(sessionManager));
```

Every module installs `apiKeyAuthMiddleware()` on `*` itself (except `ping`, `health`, `version`,
which are public) — there is no global API auth middleware ([[Request Lifecycle]]).

## Two path dialects

BunWa keeps WAHA's split between **session-in-path** and **session-in-body** routes:

| Dialect | Example | Session comes from |
|---|---|---|
| Session in path | `GET /api/sessions/:session/chats` | `workingSessionResolver()` reads `:session` |
| Session in body | `POST /api/sendText` | `getSessionFromBody()` reads `session` from the JSON body |

Messaging, contact and check-number routes use the body dialect because that is what WAHA clients send.
Everything newer (chats, groups, channels, labels, presence, status, webhooks, templates, media, profile,
LIDs, MCP config) is path-scoped.

## Conventions

- **Auth**: `X-Api-Key` or dashboard Basic credentials ([[Security Model]]).
- **Errors**: exception → status via `globalErrorHandler`; 500s are sanitised in the body and logged in full.
- **Validation**: mostly hand-rolled `c.req.json()` parsing; **Zod** in webhooks and MCP tools;
  `class-validator` decorators on DTOs are decorative leftovers.
- **Pagination**: chat message endpoints take `limit` / `offset` / `downloadMedia` style query params.
- **Body limit**: 10 MB (`Content-Length` guard) — send media as base64 URLs or `file://`-style paths, not inlined blobs.
- **Rate limit**: 200 req/min per IP on `/api/*`.
- **Naming**: mirrors WAHA (`/sendText`, `/sendSeen`, `/api/sessions/:session/...`), so existing WAHA
  scripts and SDKs work unchanged.

## Public (unauthenticated) endpoints

```text
GET /ping             → liveness
GET /health           → health, 503 while draining
GET /api/version      → { version, engine, tier, platform, worker }
GET /api/dashboard/login   → dashboard credential check (rate-limited 10/min)
POST /webhook/chatwoot/:session   → HMAC-verified instead of api-key protected
```

Everything else needs credentials unless `WAHA_ALLOW_NO_AUTH` is not `false` *and* no `WAHA_API_KEY` is set
(development convenience — never ship that combination).

## Where to find what

| Domain | Note |
|---|---|
| Sessions, auth, QR, config, MCP config, screenshot | [[Endpoints by Domain#Sessions & auth]] |
| Messaging, status, media, files, templates, bulk | [[Endpoints by Domain#Messaging]] |
| Chats, contacts, groups, channels, labels, LIDs, presence, profile, calls | [[Endpoints by Domain#Chats · contacts · groups]] |
| Webhooks, apps, audit, infra, server, workers | [[Endpoints by Domain#Ops & integrations]] |

## Related

[[Endpoints by Domain]] · [[WebSocket Events]] · [[API Docs]] · [[Request Lifecycle]] · [[Security Model]]

---
type: note
section: security
tags: [bunwa, security, auth]
updated: 2026-10-04
source: src/middleware/, src/core/api-keys/, src/common/security/, src/core/exceptions.ts
status: shipped
---

# 🔐 Security Model

Five independent trust boundaries: **API callers**, **the dashboard**, **the API docs page**,
**webhook receivers**, and **AI agents via MCP**. Each has its own credential story.

## The five boundaries

| Boundary | Credential | Notes |
|---|---|---|
| REST API | `X-Api-Key: $WAHA_API_KEY`, dashboard Basic credentials, or a per-session `sk_ses_...` key | master and Basic are admin-equivalent; session keys are scoped to one session and an action allowlist |
| Dashboard UI | Basic `WAHA_DASHBOARD_USERNAME` / `WAHA_DASHBOARD_PASSWORD` | `GET /api/dashboard/login`, rate-limited 10/min; creds kept in `localStorage` |
| `/api-docs` | optional Basic (`WHATSAPP_SWAGGER_USERNAME`/`PASSWORD`) | only installed when credentials are configured |
| Chatwoot inbound webhook | **HMAC** over the raw body (`X-Chatwoot-Signature`) using the app's `webhookSecret` | no api-key middleware on `/webhook/chatwoot/:session`; falls back to an `account.id` comparison when no secret is set |
| MCP | global `WAHA_API_KEY` or a per-session `sk_mcp_…` key | only the SHA-256 **hash** is stored; policy per session ([[MCP Server]]) |

## Authorisation (policies)

Hand-rolled CASL-style middleware in `src/middleware/policies.ts` — the `@casl/ability` dependency
exists but is not used for this:

```text
CanServer(Action.X)                    → admin only
CanSession(Action.X, FromParam('session'))  → admin, or a scoped key whose allowlist contains X and whose session matches
```

`Action` enum: `manage`, `list`, `retrieve`, `create`, `delete`, `setting`, `control`, `app`,
`read`, `send`. Value extractors: `FromParam`, `FromBody`, `FromQuery`.

Master keys and dashboard Basic still resolve to `{ isAdmin: true }`. Per-session credentials now
exist in two independent namespaces: `sk_mcp_...` for the MCP endpoint and `sk_ses_...` for REST.
A REST session key resolves to `{ isAdmin: false, session, actions }`, so it fails `CanServer`
entirely (no session list/create, audit, infra, server stop, or key management) and `CanSession`
checks both the session match and the action allowlist. Cross-session requests return the same 403
whether or not the target session exists. Neither key type is accepted by the other surface.

## Outbound request safety (SSRF)

`src/common/security/ssrf-guard.ts` guards **every** outbound fetch to a user-supplied URL:

- DNS resolution with a 10 s deadline, then blocklist checks against IPv4 CIDRs and IPv6 forms
  (v4-mapped, 6to4, NAT64) — so `127.0.0.1`, `10/8`, `169.254.169.254`, `::1` etc. are refused.
- Manual redirect following (`resolveAndPinFetch`), max 5 hops, re-validating each hop — blocks
  redirect-based bypasses.
- `SSRF_ALLOWED_HOSTS` allow-list for internal endpoints you *do* trust.
- `WEBHOOK_SSRF_PROTECT=false` opts out (documented as unsafe).

Applies to webhook delivery ([[Webhooks]]) and remote media/`file://`-style inputs via `fetchBuffer`
— the latter was the fix in commit `f76de62`.

## Integrity and replay

- **HMAC-SHA256** signatures over raw bodies, hex-encoded, with timing-safe verification
  (`src/common/security/webhook-signing.ts`) — shared by outbound webhooks, Chatwoot inbound
  verification and idempotency keys.
- `X-WAHA-Idempotency-Key` is stable per event so receivers can de-duplicate retries.
- `X-WAHA-Delivery-Id` is stable across retries of one delivery.

## Secret handling

| Practice | Where |
|---|---|
| Timing-safe comparison of API keys and passwords | `api-key-auth.ts`, `main.ts` (login, static) |
| MCP and REST keys stored as SHA-256 hashes, plaintext shown once | `mcp-config.routes.ts`, `api-keys.routes.ts` |
| `.env`-backed config; `PUT /api/infra/config` rewrites `.env` preserving comments/order | `infra.routes.ts` |
| Credentials never logged; failed auth attempts **are** logged to the audit trail | [[Audit Log]] |

## Transport & abuse controls

| Control | Value |
|---|---|
| Rate limit (API) | 200 req/min per IP on `/api/*` — `TRUSTED_PROXIES` switches to `x-forwarded-for` |
| Rate limit (login) | 10/min |
| Rate limit (MCP) | 60/min per key, configurable |
| Body size | 10 MB `Content-Length` guard on `/api/*` |
| CORS | `*` without credentials by default; explicit `WAHA_CORS_ORIGIN` enables credentialed CORS for those origins only |
| Path traversal | `isPathSafe()` on the dashboard static handler and on `GET /api/files/:session/:filename` (tested — `path-traversal.test.ts`) |
| Error leakage | 500 bodies are generic; details go to logs and the audit trail |

## ⚠️ Operational cautions

1. **`WAHA_ALLOW_NO_AUTH` defaults to "true"** — with no `WAHA_API_KEY` set, the API is open. Boot logs a
   warning only when `WAHA_ALLOW_NO_AUTH=false` *and* no key is set (i.e. the fail-closed misconfiguration).
   Always set `WAHA_API_KEY` in production. The **MCP endpoint** honors the same switch — keyless calls are
   refused once `WAHA_ALLOW_NO_AUTH=false` — and boot additionally warns whenever MCP is mounted without a
   key; `MCP_ENABLED=false` unmounts MCP entirely.
2. **Dashboard credentials are admin credentials.** There is no separate read-only dashboard role, and
   the frontend stores the Basic token in `localStorage` (`waha_dashboard_auth`).
3. **The dashboard sends a hardcoded `x-api-key: waha`** alongside Basic auth (`frontend/src/lib/api.ts`).
   Harmless when the real key is `waha` or when Basic auth is accepted, but it is a confusing artefact —
   see [[Dashboard]] and [[Roadmap]].
4. **The 10 MB body cap** is enforced twice: the `/api/*` middleware gives a fast JSON `413` from the
   `Content-Length` header, and `Bun.serve({ maxRequestBodySize })` enforces the same limit at the
   protocol level for chunked requests that omit a length. The earlier header-only bypass is closed
   (verified: an 11 MB chunked POST → `413`) — see [[Bun Runtime Adoption]].
5. **Media URLs are bearer-free** once known: `GET /api/files/...` requires an API key, but S3 presigned
   URLs are valid for 1 h to anyone holding the link.
6. **`/mcp` is outside the `/api/*` limiter** and, with no `WAHA_API_KEY` configured, **open** — check
   this before exposing the service publicly.

## Related

[[Request Lifecycle]] · [[Webhooks]] · [[MCP Server]] · [[Audit Log]] · [[Known Gaps and Stubs]]

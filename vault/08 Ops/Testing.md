---
type: note
section: ops
tags: [bunwa, ops, dev, testing]
updated: 2026-09-14
source: src/__tests__/, bunfig.toml, .github/workflows/ci.yml
status: shipped
---

# 🧪 Testing

`bun test` — **104 tests across 15 files** in `src/__tests__/`, preloaded with `setup.ts` via
`bunfig.toml`:

```toml
[test]
preload = ["./src/__tests__/setup.ts"]
```

## Current state (verified 2026-09-14)

```text
104 tests · 205 expect() calls · 15 files
104 pass · 0 fail        ← suite is green
```

The two long-standing failures (`Sessions API > creates/deletes a new session`) were a **test-harness**
problem: `manager.core.ts` audits session changes via `container.resolve(AuditService)`, whose
constructor takes a path/DB handle, so tsyringe threw `TypeInfo not known for "Object"` and the route
500'd. Fixed by registering the instance against a temp directory in `beforeAll` — the same fix
commit `30ac09c` applied to the webhook tests. Details in [[Dependency Injection]] and
[[Bun Runtime Adoption]].

## The 15 files

| File | Covers |
|---|---|
| `auth.test.ts` | API-key auth middleware (missing / invalid / valid key) |
| `sessions.test.ts` | sessions CRUD over the Hono app (registers `AuditService` for the audit path) |
| `manager.test.ts` | session manager behaviour (needs installed deps — Baileys import) |
| `webhook-delivery.test.ts` | delivery pipeline + audit registration |
| `webhook-signing.test.ts` | **wire-format contract** for HMAC signatures + idempotency keys (pinned vector) |
| `webhooks-validation.test.ts` | Zod schemas for webhook create/update |
| `error-handler.test.ts` | exception → status mapping, oversized-body 413, no internal detail leakage on 500 |
| `chatwoot-hmac.test.ts` | Chatwoot webhook HMAC verification |
| `mcp-auth.test.ts` | MCP key validation and session scoping |
| `mcp-endpoint.test.ts` | MCP HTTP endpoint behaviour |
| `fetch.test.ts` | `fetchBuffer` incl. **SSRF blocking and redirect pinning** |
| `path-traversal.test.ts` | static file serving path safety |
| `infra-config.test.ts` | `PUT /api/infra/config` — `.env` rewrite preserving comments |
| `di-container.test.ts` | container resolves `AuditService`/`TemplateService` without TypeInfo errors |
| `webjs-engine.test.ts` | WEBJS engine wiring |

`setup.ts` is the preload: it points session storage at a temp dir so tests never touch a real
`.sessions/`.

## Running

```bash
bun test                          # everything
bun test src/__tests__/fetch.test.ts
bun test --watch
```

**Prerequisite:** a complete `bun install`. A stale `node_modules` is the most common cause of
"failing" tests — e.g. after the `baileys rc13 → rc14` upgrade, `@whiskeysockets/baileys` was missing
from `node_modules` and 7 tests errored with module-resolution failures until `bun install` ran.

## CI

`.github/workflows/ci.yml`: `bun install` → `bun test` → `bun run lint` → `bun run typecheck` (**strict**).
The old "max 1049 errors" cap was replaced once the type-cleanup campaign reached zero errors — a cap
that no longer protects anything is worse than no cap, because it looks like a gate
([[Bun Runtime Adoption]], [[Docker and Deployment]]).

## Test-writing conventions

- Tests build the Hono router directly and call `app.fetch(new Request(...))` — no live socket.
- Auth is exercised with `x-api-key: waha`.
- Anything that touches storage is pointed at a temp dir in `setup.ts` so a developer's real
  `.sessions/` is never disturbed (fix `21cb433`).
- When a service is resolved from the container inside the code path, **register the instance in the
  test** — that is the lesson of `30ac09c` and of the `sessions.test.ts` fix.
- Security-relevant formats get **pinned vectors**: `webhook-signing.test.ts` asserts a hardcoded HMAC
  hex value, so an implementation swap (node:crypto → `Bun.CryptoHasher`) cannot silently change the
  bytes on the wire.

## Related

[[Dependency Injection]] · [[Known Gaps and Stubs]] · [[Runbook]] · [[Code Conventions]] · [[Docker and Deployment]]

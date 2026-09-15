# BunWa — WhatsApp HTTP API (Bun/Hono)

## Project Overview

BunWa is a WhatsApp HTTP API server built on the Bun runtime with the Hono framework. It is a 1:1 API-compatible rewrite of WAHA (WhatsApp HTTP API) that delivers the same functionality at significantly lower resource usage. Two WhatsApp engines are supported: NOWEB (Baileys, lightweight) and WEBJS (whatsapp-web.js, Puppeteer).

## Documentation

- `vault/` — Obsidian vault with the engineering view: architecture, engines, API + endpoint reference, features, MCP tools, security and an honest gap list. Open `vault/Home.md` first.
- `README.md` — user-facing setup/config; `docs/PROJECT.md` — legacy feature log.

## Commands

- `bun install` — Install dependencies
- `bun run dev` — Start development server (hot reload via bash/dev.sh)
- `bun run dev:api` — Start API only (bun --watch)
- `bun run dev:ui` — Start frontend dev server (from frontend/)
- `bun run build` — Build server binary
- `bun run start` — Start production server
- `bun test` — Run test suite
- `bun run typecheck` — TypeScript type checking (tsc --noEmit)
- `bun run lint` — Lint source code (oxlint)
- `bun run lint-fix` — Auto-fix lint issues
- `bun run setup` — Full setup (install + frontend build)

## Project Structure

```
src/
  main.ts              — Entry point
  config.ts            — Configuration constants
  config.service.ts    — Config service (env vars, settings)
  version.ts           — Version info
  helpers.ts           — Shared utilities
  swagger.ts           — OpenAPI/Swagger definitions
  api/                 — Hono route handlers
  apps/                — External app integrations (Chatwoot, etc.)
  common/              — Shared types and utilities
  core/                — Session manager, auth manager, webhook delivery
  di/                  — Dependency injection container
  engines/             — NOWEB (Baileys) and WEBJS WhatsApp engines
  mcp/                 — MCP server (Model Context Protocol) for AI agents
  middleware/          — Hono middleware (auth, error handling, logging)
  plus/                — WAHA Plus features (enterprise tier)
  structures/          — DTOs, config schemas, validation
  utils/               — Utility functions
  __tests__/           — Test files
frontend/              — React + shadcn/ui dashboard
tests/                 — Additional integration tests
```

## Architecture

- **API Layer**: Hono REST API (WAHA-compatible), MCP Server, WebSocket events
- **Core Layer**: Session lifecycle management, auth (API keys + Basic Auth), webhook engine with HMAC signing and SSRF protection
- **Engines**: NOWEB (Baileys) for lightweight operation, WEBJS (whatsapp-web.js + Puppeteer) for full WhatsApp Web parity
- **Data Layer**: SQLite (bun:sqlite) or PostgreSQL via Knex, Local FS or S3-compatible storage
- **Frontend**: React 19 + Vite + shadcn/ui + Tailwind CSS dashboard

## Configuration

Key env vars (see .env.example):

| Variable | Default | Description |
|----------|---------|-------------|
| WHATSAPP_API_PORT | 3001 | HTTP server port |
| WAHA_API_KEY | - | API key for programmatic access (required header: X-Api-Key) |
| DASHBOARD_USERNAME | admin | Dashboard login username |
| DASHBOARD_PASSWORD | admin | Dashboard login password |
| LOG_LEVEL | info | Logging verbosity |
| MCP_ENABLED | true | Enable MCP server at POST /mcp |
| WAHA_DB_TYPE | sqlite | Database driver (sqlite or postgres) |
| WAHA_STORAGE_TYPE | local | Storage backend (local or s3) |
| WHATSAPP_DEFAULT_ENGINE | noweb | Default engine (noweb or webjs) |

## Code Conventions

- TypeScript with strict mode enabled
- ES modules (type: "module" in package.json)
- Path alias: `@wha/*` maps to `./src/*`
- Decorators: experimentalDecorators + emitDecoratorMetadata for class-validator and DI
- Testing: bun test (files in src/__tests__/ and tests/)
- Linting: oxlint targeting src/
- Session configs stored in .sessions-index.json with per-session webhook, proxy, MCP tool policy settings
- Baileys auth state stored in .sessions/ directory (local) or S3 bucket
- PINO logger throughout
- tsyringe for dependency injection
- Class-validator + class-transformer for request DTOs

## Bun Runtime (1.4.x)

Prefer Bun-native APIs over Node equivalents — they are faster and avoid extra dependencies:

| Use | Instead of |
|-----|-----------|
| `Bun.CryptoHasher` (sha256/HMAC) | `node:crypto` `createHash`/`createHmac` |
| `Bun.file()` / `Bun.write()` / `Bun.file().exists()` | `fs` `readFileSync`/`writeFileSync`/`existsSync` |
| `fs/promises` in request paths | sync `fs` calls (they block the event loop) |
| `Bun.gzipSync` / `Bun.gunzipSync` | `node:zlib` streams |
| `Bun.S3Client` | `@aws-sdk/client-s3` (removed from the project) |
| `Bun.randomUUIDv7()` | `crypto.randomUUID()` for time-ordered ids |
| `Bun.sleep()` | `new Promise(r => setTimeout(r, ms))` |

Conventions that matter here:

- **Body size**: the 10 MB limit is enforced at the protocol level via
  `Bun.serve({ maxRequestBodySize })`, with a fast `Content-Length` check on `/api/*`. Don't add
  another body-size guard, and keep the 413 mapping in `src/middleware/error-handler.ts` intact.
- **Static files**: serve through `serveStaticFile()` in `src/main.ts` (async stat, ETag/304,
  immutable caching). Bun infers Content-Type and handles Range requests — don't hand-roll either.
- **Verifying a Bun API**: probe the runtime (`bun -e 'console.log(typeof Bun.x)'`) before relying on
  it, and verify behaviour, not just existence — see `vault/09 Development/Bun Runtime Adoption.md`.
- **Dependencies**: keep the tree lean; add one only when no native Bun/Web API covers the need.

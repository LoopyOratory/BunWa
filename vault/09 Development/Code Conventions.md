---
type: note
section: development
tags: [bunwa, dev, reference]
updated: 2026-09-14
source: tsconfig.json, package.json, .oxlintrc.json, CLAUDE.md
status: shipped
---

# 🛠️ Code Conventions

How code in this repo is written. Follow these and your diff will look native.

## Language & tooling

| Item | Setting |
|---|---|
| TypeScript | strict mode, ESNext target/module, `moduleResolution: bundler`, `lib: ["ESNext"]`, `types: ["bun-types"]` |
| Modules | ESM (`"type": "module"`) |
| Path alias | `@wha/*` → `./src/*` (tsconfig) |
| Decorators | `experimentalDecorators` + `emitDecoratorMetadata` — **required at runtime**, which is why `tsconfig.json` ships in the Docker image |
| Lint | `oxlint src/` (`.oxlintrc.json`) |
| Test runner | `bun test` ([[Testing]]) |
| Typecheck | `tsc --noEmit` — keep it at 0 errors |

## Structure conventions

- **One module per API domain** in `src/api/`, named `<domain>.routes.ts`, exporting a
  `create<Domain>Router()` factory. Register it in `src/api/index.ts`.
- **Thin routes**: parse, call the session/manager, map the result. Business logic belongs in
  `src/core/`.
- **Engine work belongs to engines.** If an operation is WhatsApp-specific, it goes on
  `WhatsappSession` (base class for the contract, engine for the implementation) — not into a route.
- **DTOs in `src/structures/`**, grouped by domain (`chats.dto.ts`, `sessions.dto.ts`, …). Enums
  (`WAHAEngine`, `WAHASessionStatus`, `WAHAEvents`) live in `structures/enums.dto.ts`.
- **Services are classes**; where DI is needed, register the **instance** in `src/di/container.ts`
  ([[Dependency Injection]]).
- **Errors**: throw a domain exception from `src/core/exceptions.ts`; `globalErrorHandler` maps it to a
  status. Never build an error JSON by hand in a route.
- **Logging**: pino child logger per module, structured fields first
  (`log.error({ sessionId, err }, 'message')`). Never `console.log`.
- **Config**: read env through `WhatsappConfigService` / `src/core/env.ts`, not `process.env` inline —
  the existing inline reads are the legacy path.

## Data conventions

- **JIDs**: go through `src/common/security/wa-id.ts` for parse/classify/normalise. Never hand-slice
  `@c.us`/`@g.us`/`@lid` — LID handling is subtle and there is a helper for it.
- **SQLite**: `bun:sqlite` with **WAL** enabled, schema created/migrated on boot, indexed by the
  columns you filter on (see `audit.service.ts` for the house style).
- **Settings persistence**: webhook/MCP/session settings live in `SessionConfig`, saved through
  `manager.upsert()` which writes `.sessions-index.json`. After changing webhooks, call the resync path
  (that was commit `a8097da`).

## Validation

Mixed, and worth being deliberate about:

- **Zod** is the runtime validator for new work (MCP tool `inputSchema`, webhook routes).
- `class-validator`/`class-transformer` decorators still exist on DTOs but nothing validates them at
  runtime — don't add more.
- `validateBody`/`validateQuery` in `src/middleware/validation.ts` are unused; either use them or don't
  reference them.

## Frontend conventions

- Components in `frontend/src/components/`, pages in `frontend/src/pages/`, shadcn primitives in
  `components/ui/` — **don't hand-edit generated primitives**; wrap them.
- Tailwind v4 is CSS-first: add tokens to `src/index.css` (`@theme inline`), not to a JS config.
- Use the semantic status helpers (`StatusBadge`, `mapSessionStatus`) rather than raw colours.
- `frontend/src/lib/api.ts` is the only place that should build auth headers.

## Commits

The history uses conventional prefixes, often with a scope:

```text
feat(ui): …        feat(parity): …     feat(channels): …
fix(session): …    fix(security): …    fix(tests): …     fix(types): …
docs: …            docs(readme): …
```

Scopes seen in practice: `ui`, `session`, `webhooks`, `status`, `security`, `plus`, `tests`, `dashboard`,
`channels`, `parity`, `types`. Keep one logical change per commit; the type-cleanup campaign deliberately
split ~30 commits by file cluster.

## Related

[[Directory Map]] · [[Testing]] · [[Dependency Injection]] · [[Fix History]] · [[Roadmap]]

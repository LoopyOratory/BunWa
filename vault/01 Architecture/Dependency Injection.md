---
type: note
section: architecture
tags: [bunwa, architecture, di]
updated: 2026-09-14
source: src/di/container.ts, src/main.ts
---

# 🧩 Dependency Injection

BunWa uses **tsyringe** with `experimentalDecorators` + `emitDecoratorMetadata` (both enabled in
`tsconfig.json` — Bun reads them, which is why `tsconfig.json` ships in the Docker runtime image).

## The container

`configureContainer()` in `src/di/container.ts` returns the configured container. Key detail:
services are registered **as instances**, not as classes:

```ts
container.registerInstance(AuditService, new AuditService());
container.registerInstance(SessionManager, new SessionManager(...));
```

`src/main.ts` then resolves what it needs:

```ts
const container = configureContainer();
const config          = container.resolve(WhatsappConfigService);
const dashboardConfig = container.resolve(DashboardConfigServiceCore);
const swaggerConfig   = container.resolve(SwaggerConfigServiceCore);
const sessionManager  = container.resolve(SessionManager);
setSessionManager(sessionManager);   // handed to the /ws handler
```

## Why instance registration matters

`AuditService` and `TemplateService` take **non-injectable constructor parameters**
(a path/DB handle, an options object). Registering the instance sidesteps tsyringe's need to know
`TypeInfo` for those params. If something resolves them *through* the container instead of using
the registered instance, you get:

```text
Cannot inject the dependency "dbOrPath" at position #0 of "AuditService" constructor.
Reason: TypeInfo not known for "Object"
```

That failure is exactly what [[Testing|`sessions.test.ts`]] used to trip over: `manager.core.ts`
calls `container.resolve(AuditService)` inside its `audit()` helper, so a test that wires up the
manager without registering the AuditService instance got a 500 on `POST /api/sessions` and
`DELETE /api/sessions/:session`. Commit `30ac09c` fixed the same class of problem for the webhook
tests, and the sessions test now registers the instance against a temp dir too — the suite is green
(104/104). See [[Testing]].

```text
Rule of thumb: when a test constructs the API app, register the instances it resolves —
AuditService first, then anything that reaches into the container.
```

## What is registered

`WhatsappConfigService`, `DashboardConfigServiceCore`, `SwaggerConfigServiceCore`, `AuditService`,
`TemplateService`, `SessionManager`, the Chatwoot app service/repository, and the MCP tool registry.

## Related

[[System Overview]] · [[Testing]] · [[Data and Storage]] · [[Audit Log]]

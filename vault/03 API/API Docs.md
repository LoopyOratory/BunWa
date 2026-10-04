---
type: note
section: api
tags: [bunwa, api, docs]
updated: 2026-09-14
source: src/swagger.ts, src/core/config/SwaggerConfigServiceCore.ts, src/main.ts
status: partial
---

# 📖 API Docs

Interactive API docs are served by the same process at **`/api-docs`**.

| Route | Content |
|---|---|
| `GET /api-docs` | raw OpenAPI 3.1.0 JSON (`buildOpenApiSpec()` in `src/swagger.ts`) |
| `GET /api-docs/` | **Scalar** UI rendering that spec (`@scalar/hono-api-reference`) |

Enable/disable and credentials come from `SwaggerConfigServiceCore`:

```text
WHATSAPP_SWAGGER_ENABLED=true
WHATSAPP_SWAGGER_USERNAME / WHATSAPP_SWAGGER_PASSWORD   (optional Basic auth on /api-docs/*)
WHATSAPP_SWAGGER_TITLE / DESCRIPTION / EXTERNAL_DOC_URL / CONFIG_ADVANCED
```

The dashboard's **Docs** page simply embeds `/api-docs/` in an iframe ([[Dashboard]]).

## ⚠️ The spec is hand-written, and it lags

`src/swagger.ts` is a **statically authored** document for the routes it describes, and
`src/openapi/route-coverage.ts` fills in everything it does not. It also auto-generates webhook
payload schemas from the `WAHA_WEBHOOKS` list (first few lines of the file).

| | Spec | Reality |
|---|---|---|
| Operations documented | **190** | 185 routes in the mounted table |
| Paths documented | 156 | 29 modules |

Until 2026-10-04 the spec documented 111 of the routes and nothing enforced the link, so a route
could work and be invisible, and a documented path could be stale. Route coverage now runs at
build time (`buildOpenApiSpec(app.routes)` in `src/main.ts`): every mounted route the hand-written
spec does not describe is added with a curated summary, tag, path parameters and request body
where one was written, and a derived summary otherwise. Existing entries are never overwritten.

`src/__tests__/openapi-coverage.test.ts` is the drift check: it fails if any mounted route is
undocumented, if an operation is missing a summary, tag or id, or if two operations share an id.
Adding an endpoint is now covered by that test rather than by remembering to edit the spec.

Measuring it also surfaced two defects that are now fixed: the spec carried a **duplicate
`/api/contacts` path key** (the second silently won in the object literal, so "Get all contacts"
was documented but unreachable in the reference) and two operations shared the id `getContacts`.

## Related

[[REST API]] · [[Endpoints by Domain]] · [[Known Gaps and Stubs]] · [[Configuration Reference]]

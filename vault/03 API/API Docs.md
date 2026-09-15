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

`src/swagger.ts` is a **statically authored** document — it is not generated from the Hono routes.
It also auto-generates webhook payload schemas from the `WAHA_WEBHOOKS` list (first few lines of the
file), which is the one part that stays honest automatically.

| | Spec | Reality |
|---|---|---|
| Operations documented | **113** | **175** route definitions (~173 mounted) |
| Paths documented | 96 | 29 modules |

Practical consequence: a route can work perfectly and be invisible in the docs, and a documented
path can be stale. **For the truth, read [[Endpoints by Domain]] or the route modules themselves.**

If you add an endpoint, edit `src/swagger.ts` too — nothing enforces the link.

## Related

[[REST API]] · [[Endpoints by Domain]] · [[Known Gaps and Stubs]] · [[Configuration Reference]]

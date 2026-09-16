---
type: feature
status: shipped
engine: [any]
tier: both
endpoints: 6
tags: [feature, api]
updated: 2026-09-14
source: src/core/templates/template.service.ts, src/core/bulk-message.service.ts, src/api/templates.routes.ts, src/api/chatting.routes.ts
---

# 📨 Templates and Bulk Send

Two conveniences that sit *on top of* the messaging layer: reusable message bodies, and batch sending
with progress tracking.

## Templates

`TemplateService` (`src/core/templates/template.service.ts`) — SQLite at
`${WAHA_STORAGE_DIR or ./data}/templates.db`, WAL mode.

```sql
templates(id, sessionId, name, body, header, footer, createdAt, updatedAt,
          UNIQUE(sessionId, name))
```

| Endpoint | Notes |
|---|---|
| `GET /api/sessions/:session/templates` | list a session's templates |
| `POST /api/sessions/:session/templates` | create/replace by name |
| `DELETE /api/sessions/:session/templates/:id` | |
| `PUT /api/sessions/:session/templates/:id` | edit name, body, header or footer (only the fields sent change) |
| `POST /api/sessions/:session/templates/:id/preview` | render with `{variables}` and see the result, without sending |
| `POST /api/sessions/:session/templates/:id/send` | render and send to `{chatId, variables}`; the id may be a template **name** |

**Variables**: `{{variable}}` placeholders, including nested dotted paths (`{{contact.city}}`), plus
`render()` / `preview()` and `extractVariables()` so the dashboard can show which fields a template
needs. Limits: name 100, body 4096, header/footer 1024 characters.

Templates render server-side; the caller supplies the variable values.

## Bulk send

`BulkMessageService` (`src/core/bulk-message.service.ts`), registered **per session** in an in-memory
map, with routes in `chatting.routes.ts`:

| Endpoint | Notes |
|---|---|
| `POST /api/:session/messages/send-bulk` | returns **201** with a `batchId`; sends fan out in the background |
| `GET /api/:session/messages/batch/:batchId` | progress: sent / failed / remaining |
| `POST /api/:session/messages/batch/:batchId/cancel` | stops a running batch |

```text
Per-recipient outcomes are recorded in the batch registry, so you can report
"412 sent, 6 failed (invalid numbers)" rather than guessing.
```

> ⚠️ Batch state is **in-memory only** — a restart loses batch history (in-flight sends stop too).
> Scheduled/recurring sends and a durable queue are deliberately absent; upstream's Redis/BullMQ
> processors were not ported ([[OpenWA Parity]]).

Intentional use: this is the building block for campaign-style sends. Respect WhatsApp's rate limits —
the engine sends sequentially with retry, not in a burst.

## Related

[[Messaging]] · [[Audit Log]] · [[Data and Storage]] · [[OpenWA Parity]] · [[Dashboard]]

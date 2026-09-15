---
type: note
section: ops
tags: [bunwa, ops, observability]
updated: 2026-09-14
source: src/api/health.routes.ts, src/api/server.routes.ts, src/api/workers.routes.ts, src/core/shutdown.service.ts
status: shipped
---

# 📈 Health and Observability

Three signals, no metrics endpoint: **health probes**, **structured logs (pino)**, **audit rows**.

## Health probes

| Endpoint | Purpose | Behaviour |
|---|---|---|
| `GET /ping` | liveness | trivially 200 while the process is up |
| `GET /health` | readiness | **503 while draining** (shutdown in progress), otherwise 200 |
| `GET /api/version` | build identity | `{version, engine, tier, platform, worker}` |
| `GET /api/server/status` · `/environment` | diagnostics | server status and environment payloads |

Health thresholds you can tune: `WHATSAPP_HEALTH_MEDIA_FILES_THRESHOLD_MB`,
`WHATSAPP_HEALTH_SESSION_FILES_THRESHOLD_MB` (both default 100 MB), `WHATSAPP_HEALTH_MONGO_TIMEOUT_MS`.

### Graceful shutdown

`src/core/shutdown.service.ts` implements drain-then-close:

```text
SIGTERM/SIGINT
  → readiness starts returning 503   (load balancers stop routing)
  → sessions stop, stores close
  → process exits
```

Pair it with a container/orchestrator restart policy. Note that the API's own
`POST /api/server/stop` and `POST /api/infra/restart` just `process.exit(0)` — they do **not** run the
graceful path, so use them only where a supervisor restarts the process.

## Workers

`GET /api/workers` returns a WAHA-shaped single-worker list (worker id from `WAHA_WORKER_ID`) so
WAHA dashboards/clients keep working. There is **no real multi-worker architecture** in this fork —
one process owns the sessions ([[OpenWA Parity]]).

## Logging

- **pino** is used throughout; the bootstrap logger is `Bootstrap`, route modules create their own children
  (`InfraRoutes`, `SessionRoutes`, …).
- Level from `WAHA_LOG_LEVEL` — setting it to `debug` also switches on `pino-pretty` for human-readable output.
- `WAHA_LOG_FORMAT=PRETTY|JSON`, `WAHA_HTTP_LOG_LEVEL` for request-log verbosity.
- `DEBUG=1` turns on verbose Baileys logging (very noisy — for pairing problems only).
- Uncaught exceptions and unhandled rejections are logged with stack traces before anything else.

## Audit trail

`GET /api/audit` — filter by action, api key, session, severity and date; paginate with `limit`/`offset`.
This is the closest thing to an activity log and the first place to look for "who did what"
([[Audit Log]]). The dashboard's **Logs** page and **Event Monitor** surface it live.

## What is *not* here

- **No Prometheus/metrics endpoint** (deliberately not ported — [[OpenWA Parity]]).
- **No tracing** (no OpenTelemetry).
- **No per-session uptime/history** beyond the session `_status` in `.sessions-index.json` and the
  WebSocket `session.status` stream.

If you need metrics, the cheapest path is scraping `/api/workers` + `/health` from the outside, or
adding a small `/metrics` route next to `health.routes.ts` ([[Roadmap]]).

## Related

[[Runbook]] · [[Audit Log]] · [[Configuration Reference]] · [[Docker and Deployment]] · [[Roadmap]]

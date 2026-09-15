---
type: note
section: ops
tags: [bunwa, ops, runbook]
updated: 2026-09-14
source: scripts/, package.json
status: shipped
---

# 🚀 Runbook

## Commands

| Command | What it does |
|---|---|
| `bun install` | install server deps (~508 packages; fast with the global store) |
| `bun run dev` | **dev mode** — `scripts/dev.sh`: API (`bun --watch`, :3001) + Vite UI (:5173) together |
| `bun run dev:api` | API only, watch mode |
| `bun run dev:ui` | frontend dev server only (from `frontend/`) |
| `bun run setup` | `bun install` + build the frontend into `frontend-dist/` |
| `bun run build` | `bun build src/main.ts --outdir dist --target bun` |
| `bun run build:frontend` | build + deploy the dashboard |
| `bash scripts/start.sh` | **production** — build the frontend, `mkdir -p data`, run `src/main.ts` |
| `bun test` | test suite ([[Testing]]) |
| `bun run typecheck` | `tsc --noEmit` — clean, and CI fails on any new error |
| `bun run lint` / `lint-fix` | `oxlint src/` |

## Fresh clone → running

```bash
git clone git@github.com:LoopyOratory/BunWa.git && cd BunWa
bun install
cp .env.example .env          # then set WAHA_API_KEY at minimum
bun run setup                 # or: bash scripts/build-frontend.sh
bash scripts/start.sh         # production, or `bun run dev` for HMR
```

Then:

- dashboard → `http://localhost:3000/`
- API docs → `http://localhost:3000/api-docs`
- MCP → `POST http://localhost:3000/mcp`
- pairing → create a session, start it, scan the QR from the dashboard or `GET /api/:session/auth/qr`

**Requirements beyond Bun**: `ffmpeg` for voice-note/voice-status conversion (baked into the Docker
images), and a Chrome/Chromium binary only if you use the WEBJS engine ([[WEBJS Engine]]).

## Port confusion — read this once

| Place | Port |
|---|---|
| `scripts/dev.sh` prints API `:3001`, UI `:5173`; Vite proxies `/api` → `3001` | 3001 |
| `scripts/start.sh` prints `:3000`; `bun run dev:api` runs with whatever `PORT`/`WHATSAPP_API_PORT` says (default 3000) | 3000 |
| `Dockerfile`s expose 3000 | 3000 |

So `bun run dev` runs the API on the default 3000 unless you set `PORT=3001` — and the Vite proxy
targets 3001, so the UI would fail to reach the API. **Set `PORT=3001` before `bun run dev`**, or edit
`frontend/vite.config.ts` to match your port.

## Common workflows

### Pair a new WhatsApp account

```bash
curl -X POST localhost:3000/api/sessions -H 'x-api-key: …' \
     -H 'content-type: application/json' -d '{"name":"default","start":true}'
curl localhost:3000/api/default/auth/qr -H 'x-api-key: …'      # base64 PNG
# or with a phone number to get a pairing code instead:
curl 'localhost:3000/api/default/auth/qr?phoneNumber=15551234567' -H 'x-api-key: …'
```

Console QR printing is on by default (`WAHA_PRINT_QR`).

### Send a message

```bash
curl -X POST localhost:3000/api/sendText -H 'x-api-key: …' \
     -H 'content-type: application/json' \
     -d '{"session":"default","chatId":"15551234567@c.us","text":"hello"}'
```

### Wire a webhook

Create it on the session (`POST /api/sessions/:session/webhooks`), then **test-fire it** —
`POST /api/sessions/:session/webhooks/:id/test` performs a real delivery and returns 422 on failure
([[Webhooks]]).

### Give an AI agent access

`POST /api/sessions/:session/mcp/generate-key` → returns the `sk_mcp_…` key once plus ready-to-paste
MCP host config for HTTP and stdio ([[MCP Server]]).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **QR never appears; session stuck in `STARTING`** | Baileys version. rc13 had exactly this bug; this repo is on **rc14** (commit `7c19e04`). Check `bun.lock` if you downgraded |
| `SQLITE_CANTOPEN` on first boot | historical; fixed by `AuditService` auto-creating `WAHA_STORAGE_DIR` + `mkdir -p data` in `start.sh`. If it returns, check write permissions on `WAHA_STORAGE_DIR` |
| `Cannot inject the dependency "dbOrPath" … TypeInfo not known` | tsyringe resolving `AuditService` without an explicit instance registration — a test-harness issue ([[Dependency Injection]]). In production, ensure `configureContainer()` ran before anything resolves it |
| 401 everywhere | `WAHA_API_KEY` set and the client isn't sending `X-Api-Key` (or Basic dashboard creds) — or `WAHA_ALLOW_NO_AUTH=false` with no key configured. See the boot warning |
| `sendVoice` fails | ffmpeg missing (only needed for `convert=true`) |
| WEBJS session won't start | Chrome binary not found: set `CHROME_PATH`; the manager checks before starting |
| Dashboard loads but every call fails | Vite proxy port mismatch (above) |
| Webhook never arrives | Check the audit log for `WEBHOOK_FAILED`; a private/loopback target is blocked by the SSRF guard unless allow-listed ([[Webhooks]]) |
| Media URL 404s after a minute | By design — local media has a ~180 s lifetime ([[Data and Storage]]) |
| Session lost after restart | `WHATSAPP_RESTART_ALL_SESSIONS=false` and `autoStart` unset ⇒ sessions restore as *stopped*. Set the env var or `autoStart: true` |

## Operating notes

- **Sessions are stateful and single-process.** Two BunWa processes must not share a
  `WAHA_LOCAL_STORE_BASE_DIR` — the auth files are the account pairing.
- **Restart** = `POST /api/infra/restart` / `POST /api/server/stop` → `process.exit(0)`. Both assume a
  supervisor (Docker restart policy, systemd, Coolify) brings the process back ([[Health and Observability]]).
- **Graceful shutdown** drains first: readiness flips to 503, then sessions stop.
- Before upgrading Baileys, expect to re-test QR pairing and media — that library is the most volatile
  dependency in the stack.

## Related

[[Configuration Reference]] · [[Testing]] · [[Docker and Deployment]] · [[Health and Observability]] · [[Data and Storage]]

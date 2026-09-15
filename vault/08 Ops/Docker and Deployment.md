---
type: note
section: ops
tags: [bunwa, ops, docker, deployment]
updated: 2026-09-14
source: Dockerfile, Dockerfile.coolify, .github/workflows/docker.yml, .dockerignore
status: shipped
---

# 🐳 Docker and Deployment

Two Dockerfiles and one image-publishing workflow. There is **no `docker-compose.yml`** in the repo
despite what the older docs claim ([[Known Gaps and Stubs]]).

## `Dockerfile` — production image

Multi-stage: `oven/bun:1` builder → `oven/bun:1-slim` runtime.

```text
builder
  PUPPETEER_SKIP_DOWNLOAD=true        (don't fetch Chromium)
  bun install --frozen-lockfile
  cd frontend && bun install --frozen-lockfile
  bash scripts/build-frontend.sh      → frontend-dist/

runtime (oven/bun:1-slim)
  apt-get install ffmpeg              ← required for voice transcoding
  non-root user waha (uid/gid 1001)
  COPY src/ · frontend-dist/ · package.json · bun.lock · tsconfig.json
  bun install --frozen-lockfile --production
```

Two details worth keeping:

- **`tsconfig.json` ships in the runtime image** because Bun reads `experimentalDecorators` /
  `emitDecoratorMetadata` from it — without those, class-transformer decorators throw at import time.
- **`ffmpeg` is deliberately installed**; without it `sendVoice` with `convert=true` fails.

`.dockerignore` excludes `node_modules`, `dist`, `frontend-dist`, `.sessions`, `data`, `.env`,
`.git`, `docs/`, `*.md` (except README) and tests — so runtime data is never baked into an image.

## `Dockerfile.coolify` — Coolify build pack

Same two stages, tuned for [Coolify](https://coolify.io):

- **No `VOLUME`** — Coolify manages persistent storage separately (that's where the sessions volume is
  configured, and where the README's "confirm the mount is a real host path, not an anonymous volume"
  checklist applies).
- Coolify labels + explicit port 3000 for auto-detection.
- Frontend is built during the Coolify build from source.

Coolify checklist from the README: the `.sessions` mount must be a real host path
(e.g. `/data/bunwa/sessions`), owned by **UID/GID 1001**, and writable by the container.

## Volumes you need

| Container path | Contents | Why it matters |
|---|---|---|
| `/app/.sessions` | Baileys auth state, session index, WEBJS LocalAuth, Chatwoot app config | **losing this unpairs every WhatsApp account** |
| `/app/data` | `audit.db`, `templates.db` | operational history + templates |
| media folder (`/tmp/whatsapp-files` by default) | ephemeral media | exists only ~180 s; mount it if you serve media after the fact, or use S3 |

## Environment in containers

Pass configuration with `-e` / the platform's env editor. Typical minimum:

```bash
docker run -d --name bunwa -p 3000:3000 \
  -e WAHA_API_KEY=your-secret \
  -e WAHA_DASHBOARD_USERNAME=admin -e WAHA_DASHBOARD_PASSWORD=strong-pass \
  -e WHATSAPP_DEFAULT_ENGINE=NOWEB \
  -v /data/bunwa/sessions:/app/.sessions \
  -v /data/bunwa/data:/app/data \
  --restart unless-stopped loopyoratory/bunwa:latest
```

For WEBJS, also mount Chrome (`-v /usr/bin/google-chrome:/usr/bin/google-chrome`) or set
`CHROME_PATH` to a binary inside the image — Chromium is **not** bundled.

## Publishing — `.github/workflows/docker.yml`

| Trigger | Tags |
|---|---|
| push to `main` | `:latest`, `:main`, `:sha-<short>` |
| tag `v1.2.3` | `:1.2.3`, `:1.2`, `:sha-<short>` |
| manual dispatch | `:sha-<short>` (+ `:latest` if run from `main`), selectable platforms |

Image: **`loopyoratory/bunwa`**, default platforms `linux/amd64,linux/arm64`. Requires the repo
secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (Read/Write).

## CI — `.github/workflows/ci.yml`

Runs on push/PR to `main`: `bun install` → `bun test` → `bun run lint` → `bun run typecheck` (**strict**).
The old "max 1049 errors" cap was removed after the type-cleanup campaign reached zero errors — it had
become a gate that could never fail ([[Bun Runtime Adoption]], [[Testing]]).

> Note: `bun.yml` (upstream's release workflow) does not exist here; `ci.yml` + `docker.yml` are the
> only workflows.

## Related

[[Runbook]] · [[Configuration Reference]] · [[Health and Observability]] · [[Data and Storage]] · [[Roadmap]]

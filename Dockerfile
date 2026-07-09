# ─────────────────────────────────────────────────────────────────────────────
# BunWa — WhatsApp HTTP API Server
# Multi-stage Docker build: Bun builder → slim production runtime.
# ─────────────────────────────────────────────────────────────────────────────

# ──────────── stage 1: build ────────────
FROM oven/bun:1 AS builder
WORKDIR /app

# Skip Puppeteer's Chromium download at install time — WEBJS users mount
# Chrome from the host or install it in a derived image.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install all deps (including dev deps needed for the frontend build)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Install frontend deps (separate tree)
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile

# Copy source and build the frontend
COPY . .
RUN bash scripts/build-frontend.sh

# ──────────── stage 2: production ────────────
FROM oven/bun:1-slim
WORKDIR /app

# Non-root user
RUN groupadd --system --gid 1001 waha && \
    useradd --system --uid 1001 --gid waha waha

# Runtime files only — no frontend/ source, no scripts/, no __tests__/
# tsconfig.json is required at runtime: Bun reads experimentalDecorators /
# emitDecoratorMetadata from it, without which class-transformer decorators
# throw at import time.
COPY --from=builder /app/src ./src
COPY --from=builder /app/frontend-dist ./frontend-dist
COPY --from=builder /app/package.json /app/bun.lock /app/tsconfig.json ./

# Production deps (skips typescript, oxlint, @types/*, and dev-only packages)
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN bun install --frozen-lockfile --production

# ── data dirs ────────────────────────────────────────────────────────────────
# .sessions   — WhatsApp auth state, session index, SQLite databases
# .media      — downloaded media files
# data        — audit logs, templates, export/import artifacts
RUN mkdir -p /app/.sessions /app/.media /app/data && \
    chown -R waha:waha /app/.sessions /app/.media /app/data

# ── volumes ──────────────────────────────────────────────────────────────────
# Mount these from the host or a named volume so auth state and media survive
# container restarts:
#   /app/.sessions   — session auth state + SQLite DBs
#   /app/.media      — downloaded WhatsApp media
#   /app/data        — audit logs, templates
#   /app/.env        — configuration (or use env vars)
VOLUME ["/app/.sessions", "/app/.media", "/app/data"]

USER waha

# ── defaults (override with -e or .env) ──────────────────────────────────────
ENV PORT=3000
ENV WHATSAPP_DEFAULT_ENGINE=NOWEB
ENV WHATSAPP_FILES_FOLDER=/app/.media
ENV WAHA_LOCAL_STORE_BASE_DIR=/app/.sessions
ENV WAHA_STORAGE_DIR=/app/data
ENV DATA_DIR=/app/data

EXPOSE 3000

# Health check — hits the unauthenticated /health endpoint every 30s.
# Uses bun's fetch since the slim image ships neither curl nor wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "const r=await fetch('http://localhost:'+(process.env.PORT||3000)+'/health');process.exit(r.ok?0:1)"

CMD ["bun", "run", "src/main.ts"]

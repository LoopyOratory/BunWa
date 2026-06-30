FROM oven/bun:1 AS builder
WORKDIR /app

# Backend deps (all incl. dev — needed for frontend build)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Frontend deps (separate tree)
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile

# Source + build frontend
COPY . .
RUN bash scripts/build-frontend.sh

# ──────────── production ────────────

FROM oven/bun:1-slim
WORKDIR /app

# Non-root user
RUN groupadd --system --gid 1001 waha && \
    useradd --system --uid 1001 --gid waha waha

# Only what's needed at runtime — no frontend/ source, no scripts/, no __tests__/
COPY --from=builder /app/src ./src
COPY --from=builder /app/frontend-dist ./frontend-dist
COPY --from=builder /app/package.json /app/bun.lock ./

# Production deps only (skips typescript, oxlint, @types/*)
RUN bun install --frozen-lockfile --production

# Writable data dirs
RUN mkdir -p /app/.media /app/.sessions && \
    chown waha:waha /app/.media /app/.sessions

USER waha

ENV PORT=3000
ENV WHATSAPP_DEFAULT_ENGINE=NOWEB
ENV WAHA_MEDIA_STORAGE=LOCAL
ENV WHATSAPP_FILES_FOLDER=/app/.media

EXPOSE 3000
CMD ["bun", "run", "src/main.ts"]

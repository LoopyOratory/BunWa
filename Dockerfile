FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Download dashboard
RUN bash scripts/download-dashboard.sh

# Build
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS production
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 waha && \
    adduser --system --uid 1001 --ingroup waha waha

# Copy built assets
COPY --from=base /app/dist ./dist
COPY --from=base /app/dashboard ./dashboard
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

# Create media directories and set ownership
RUN mkdir -p /app/.media /app/.sessions && \
    chown -R waha:waha /app

# Switch to non-root user
USER waha

# Environment defaults
ENV PORT=3000
ENV WHATSAPP_DEFAULT_ENGINE=NOWEB
ENV WAHA_MEDIA_STORAGE=LOCAL
ENV WHATSAPP_FILES_FOLDER=/app/.media

EXPOSE 3000

CMD ["bun", "run", "dist/main.js"]

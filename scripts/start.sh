#!/bin/bash
set -e

BUNWA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== BUNWA - Production Mode ==="
echo ""

echo "[1/2] Building frontend..."
bash "$BUNWA_DIR/scripts/build-frontend.sh"

echo ""
echo "[2/2] Starting server..."
echo ""
  echo "  Server: http://localhost:3000"
echo ""

mkdir -p "$BUNWA_DIR/data"
cd "$BUNWA_DIR"
# --no-orphans: if this server process exits, take its descendants with it —
# notably the Chrome a WEBJS session spawns (Bun >= 1.4).
bun run --no-orphans src/main.ts

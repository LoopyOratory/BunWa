#!/bin/bash
set -e

WAHA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== BUNWA - Production Mode ==="
echo ""

echo "[1/2] Building frontend..."
bash "$WAHA_DIR/scripts/build-frontend.sh"

echo ""
echo "[2/2] Starting server..."
echo ""
  echo "  Server: http://localhost:3000"
echo ""

mkdir -p "$WAHA_DIR/data"
cd "$WAHA_DIR"
bun run src/main.ts

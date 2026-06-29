#!/bin/bash
set -e

WAHA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== WAHA - Production Mode ==="
echo ""

echo "[1/2] Building frontend..."
bash "$WAHA_DIR/scripts/build-frontend.sh"

echo ""
echo "[2/2] Starting server..."
echo ""
echo "  Server: http://localhost:3001"
echo ""

cd "$WAHA_DIR"
bun run src/main.ts

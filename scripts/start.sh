#!/bin/bash
set -e

WAHA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== WAHA - WhatsApp HTTP API ==="
echo ""

# Step 1: Build frontend
echo "[1/2] Building frontend dashboard..."
bash "$WAHA_DIR/scripts/build-frontend.sh"

# Step 2: Start backend server
echo ""
echo "[2/2] Starting server..."
echo ""
cd "$WAHA_DIR"
bun run src/main.ts

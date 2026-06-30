#!/bin/bash
set -e

WAHA_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_SRC="$WAHA_DIR/frontend"
FRONTEND_DIST="$WAHA_DIR/frontend-dist"

echo "=== Building Frontend Dashboard ==="
echo ""

echo "[1/3] Installing dependencies..."
cd "$FRONTEND_SRC"
bun install --frozen-lockfile 2>/dev/null || bun install

echo ""
echo "[2/3] Building..."
bun run build

echo ""
echo "[3/3] Deploying to $FRONTEND_DIST ..."
rm -rf "$FRONTEND_DIST"
cp -r "$FRONTEND_SRC/dist" "$FRONTEND_DIST"

echo ""
echo "=== Done! ==="
echo "Frontend built and deployed."
echo "Access at: http://localhost:3000/"

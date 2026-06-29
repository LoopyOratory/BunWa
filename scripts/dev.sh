#!/bin/bash
set -e

WAHA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== WAHA - Dev Mode ==="
echo ""
echo "Starting backend API + frontend dev server (HMR)..."
echo ""
echo "  API:  http://localhost:3001"
echo "  UI:   http://localhost:5173"
echo ""

cleanup() {
  echo ""
  echo "Shutting down..."
  kill 0 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

cd "$WAHA_DIR"
bun --watch run src/main.ts &
cd "$WAHA_DIR/frontend"
bun run dev &

wait

#!/bin/bash
set -e

BUNWA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== BunWa - Dev Mode ==="
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

cd "$BUNWA_DIR"
bun --watch run src/main.ts &
cd "$BUNWA_DIR/frontend"
bun run dev &

wait

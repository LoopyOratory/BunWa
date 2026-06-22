#!/bin/bash
set -e

WAHA_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== WAHA - Dev Mode ==="
echo ""

# Build frontend first
bash "$WAHA_DIR/scripts/build-frontend.sh"

echo ""
echo "Starting backend server in watch mode..."
echo ""
echo "  API:       http://localhost:3000"
echo "  UI (prod): http://localhost:3000/ui/"
echo "  Swagger:   http://localhost:3000/api-docs"
echo ""
echo "For HMR frontend dev, run 'bun run dev:ui' in another terminal"
echo "  UI (dev):  http://localhost:5173/ui/"
echo ""

cd "$WAHA_DIR"
bun --watch run src/main.ts

# Plan 02: WebSocket Authentication

**Finding**: WebSocket `/ws` endpoint accepts connections without any authentication
**Impact**: HIGH — any client can subscribe to all session events
**Effort**: S (hours)
**Risk**: MED — must ensure upgrade request headers are accessible
**Depends on**: None

## Problem

`src/main.ts:219-228` handles WebSocket upgrade on `/ws` via `Bun.serve` fetch handler. This runs before any Hono middleware, so `apiKeyAuthMiddleware` is never applied. `src/api/websocket.ts:11-46` accepts all connections unconditionally.

```typescript
// src/main.ts — WebSocket upgrade has no auth
websocket: {
  open: (ws) => { ... },
  message: (ws, msg) => { ... },
  close: (ws) => { ... },
},
```

## Scope

- **In scope**: `src/main.ts` (WebSocket upgrade handler), `src/api/websocket.ts` (open handler)
- **Out of scope**: REST API routes (already protected)

## Steps

### Step 1: Read the API key in the upgrade handler

In `src/main.ts`, the WebSocket upgrade handler receives a `server.upgrade(req)` call. The API key can be read from:
- `req.headers.get('x-api-key')` — header-based auth
- URL query param: `new URL(req.url).searchParams.get('x-api-key')` — for browser WebSocket clients

Add validation before the upgrade:

```typescript
// In the fetch handler, before websocket upgrade
const url = new URL(req.url);
if (url.pathname === '/ws') {
  const apiKey = req.headers.get('x-api-key') || url.searchParams.get('x-api-key');
  const configService = container.resolve(WhatsappConfigService);
  const validKey = configService.get('apiKey');

  if (validKey && apiKey !== validKey) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... proceed with upgrade
}
```

### Step 2: Verify

```bash
bun run dev &

# Test without API key (should be rejected)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  "http://localhost:3000/ws"
# Expected: 401

# Test with wrong key (should be rejected)
curl -s -o /dev/null -w "%{http_code}" \
  -H "x-api-key: wrong" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  "http://localhost:3000/ws"
# Expected: 401

# Test with correct key (should connect)
# Use wscat or similar for full WebSocket test
```

## Done Criteria

- [ ] WebSocket connections without valid API key are rejected with 401
- [ ] WebSocket connections with valid API key work normally
- [ ] Frontend Event Monitor page still connects (it reads the API key from window.__WAHA_API_KEY__)

## Maintenance Note

If the frontend Event Monitor needs to connect without an API key in the future, add a configuration option `WAHA_WEBSOCKET_AUTH_ENABLED` (default: true).

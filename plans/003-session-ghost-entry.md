# Plan 03: Session Ghost Entry Fix

**Finding**: Session start failure leaves ghost entry in sessions map, preventing re-creation
**Impact**: HIGH — session gets stuck in broken state after failed start
**Effort**: S (hours)
**Risk**: LOW
**Depends on**: None

## Problem

`src/core/manager.core.ts:104` adds the session to the map before calling `session.start()` at line 107. If `start()` fails, the catch at line 108 logs the error but the session remains in the map. Subsequent attempts to create a session with the same name see `this.sessions.has(name)` as true and skip adding.

```typescript
// src/core/manager.core.ts:100-110
const session = new Session(name, config, ...);
this.sessions.set(name, session);  // ← Added before start
try {
  await session.start();  // ← If this fails...
} catch (error) {
  this.logger.error(error, `...`);
  // ← Session is still in the map as a broken entry
}
```

## Scope

- **In scope**: `src/core/manager.core.ts` lines 100-115 (start logic)
- **Out of scope**: Session class, other managers

## Steps

### Step 1: Remove session from map on start failure

In `src/core/manager.core.ts`, modify the catch block:

```typescript
try {
  await session.start();
} catch (error) {
  this.logger.error(error, `Failed to start session '${name}'`);
  this.sessions.delete(name);  // ← Add this line
  throw error;  // ← Re-throw so caller knows it failed
}
```

### Step 2: Verify

```bash
bun run dev &

# Create a session
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "test-ghost"}'

# Start it (may fail if no WhatsApp connection)
curl -s -X POST http://localhost:3000/api/sessions/test-ghost/start \
  -H "x-api-key: waha"

# List sessions — ghost should NOT appear
curl -s http://localhost:3000/api/sessions \
  -H "x-api-key: waha" | python3 -m json.tool

# Try creating with same name — should succeed
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "test-ghost"}'
```

## Done Criteria

- [ ] Failed session start removes the entry from the sessions map
- [ ] Re-creating a session with the same name succeeds after a failed start
- [ ] Successful session start still works as before

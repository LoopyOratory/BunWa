# Plan 05: StatusTracker Reset on Restart

**Finding**: StatusTracker counts accumulate across session restarts, causing premature stuck detection
**Impact**: MED — session may be force-stopped after multiple restart attempts
**Effort**: S (hours)
**Risk**: LOW
**Depends on**: None

## Problem

`src/utils/StatusTracker.ts:1-30` — The `counts` Map persists across session lifecycle. `src/core/engines/noweb/session.noweb.core.ts:556` — `isStuckInStarting()` checks if `STARTING` count exceeds 60. After several restart attempts, the accumulated count from prior attempts triggers this threshold prematurely.

```typescript
// src/utils/StatusTracker.ts
class StatusTracker {
  counts = new Map<string, number>();  // Never reset

  isStuckInStarting(): boolean {
    return (this.counts.get('STARTING') || 0) > 60;
  }
}
```

## Scope

- **In scope**: `src/utils/StatusTracker.ts` (add reset method), `src/core/engines/noweb/session.noweb.core.ts` (call reset on start)
- **Out of scope**: Other status tracking logic

## Steps

### Step 1: Add `reset()` method to StatusTracker

```typescript
// src/utils/StatusTracker.ts
reset() {
  this.counts.clear();
}
```

### Step 2: Call reset when starting a new connection

In `src/core/engines/noweb/session.noweb.core.ts`, find the `buildClient()` method (or wherever the connection starts) and add:

```typescript
this.statusTracker.reset();
```

### Step 3: Verify

```bash
bun run dev &

# Create and start a session
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "test-restart"}'

curl -s -X POST http://localhost:3000/api/sessions/test-restart/start \
  -H "x-api-key: waha"

# Restart multiple times
for i in {1..5}; do
  curl -s -X POST http://localhost:3000/api/sessions/test-restart/restart \
    -H "x-api-key: waha"
  sleep 2
done

# Session should still be running, not force-stopped
curl -s http://localhost:3000/api/sessions/test-restart \
  -H "x-api-key: waha" | python3 -m json.tool
```

## Done Criteria

- [ ] `StatusTracker.reset()` clears the counts Map
- [ ] Each session restart starts with fresh counts
- [ ] `isStuckInStarting()` only triggers for the current attempt, not accumulated history

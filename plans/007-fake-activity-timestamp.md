# Plan 07: Fake Activity Timestamp

**Finding**: `getSessions()` returns `Date.now()` as activity timestamp — always shows "now"
**Impact**: MED — misleading "last activity" data in frontend
**Effort**: S (hours)
**Risk**: LOW
**Depends on**: None

## Problem

`src/core/manager.core.ts:162` — `timestamps: { activity: Date.now() }` always returns the current time, not the actual last activity time. The session class already tracks `lastActivityTimestamp` but `SessionManager.getSessions()` doesn't use it.

```typescript
// src/core/manager.core.ts:162 — BROKEN
timestamps: { activity: Date.now() }  // Always "now"
```

## Scope

- **In scope**: `src/core/manager.core.ts` (getSessions method)
- **Out of scope**: Frontend display, session class internals

## Steps

### Step 1: Use actual activity timestamp

Change `src/core/manager.core.ts:162`:

```typescript
// From:
timestamps: { activity: Date.now() }

// To:
timestamps: { activity: (session as any).getLastActivityTimestamp?.() || Date.now() }
```

### Step 2: Verify

```bash
bun run dev &

# Create session, start it, send a message, wait
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "test-activity"}'

curl -s -X POST http://localhost:3000/api/sessions/test-activity/start \
  -H "x-api-key: waha"

# Wait 30 seconds, then check sessions
sleep 30
curl -s http://localhost:3000/api/sessions \
  -H "x-api-key: waha" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data:
    print(f'{s[\"name\"]}: activity={s.get(\"timestamps\", {}).get(\"activity\")}')
"
# Activity should be ~30 seconds ago, not "now"
```

## Done Criteria

- [ ] `getSessions()` returns actual last activity timestamp
- [ ] Timestamp reflects real user activity (message send/receive), not request time

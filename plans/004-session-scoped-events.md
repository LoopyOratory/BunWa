# Plan 04: Session-Scoped Events

**Finding**: `getSessionEvents()` ignores session parameter — all WebSocket clients receive all sessions' events
**Impact**: HIGH — data leak, incorrect event routing
**Effort**: M (a day)
**Risk**: MED — affects entire event delivery pipeline
**Depends on**: None

## Problem

`src/core/manager.core.ts:71-73` — `getSessionEvent(session, event)` ignores the `session` parameter and returns `this.events2.get(event)`, which is a global `DefaultMap<WAHAEvents, SwitchObservable>` not scoped to any session.

```typescript
// src/core/manager.core.ts:71-73 — BROKEN
getSessionEvent(session: string, event: WAHAEvents): Observable<any> {
  return this.events2.get(event);  // session parameter ignored
}
```

The WebSocket handler at `src/api/websocket.ts:27-28` passes `sessionParam` to `getSessionEvents()`, but it's discarded.

## Scope

- **In scope**: `src/core/manager.core.ts` (event routing), `src/api/websocket.ts` (event subscription)
- **Out of scope**: Session event emission (already works correctly)

## Steps

### Step 1: Make `events2` per-session

Change `events2` from `DefaultMap<WAHAEvents, SwitchObservable>` to `DefaultMap<string, DefaultMap<WAHAEvents, SwitchObservable>>` keyed by session name.

In `src/core/abc/session.abc.ts` or `src/core/manager.core.ts`:

```typescript
// Change from:
events2: DefaultMap<WAHAEvents, SwitchObservable> = new DefaultMap(
  () => new SwitchObservable()
);

// Change to:
events2: DefaultMap<string, DefaultMap<WAHAEvents, SwitchObservable>> = new DefaultMap(
  () => new DefaultMap(() => new SwitchObservable())
);
```

### Step 2: Update `getSessionEvent` to scope by session

```typescript
// src/core/manager.core.ts
getSessionEvent(session: string, event: WAHAEvents): Observable<any> {
  return this.events2.get(session).get(event);
}
```

### Step 3: Update event emission to include session name

Where events are emitted (in session classes), ensure the session name is included in the event payload. The session class already has `this.name` — verify it's passed through.

### Step 4: Update WebSocket handler to filter by session

In `src/api/websocket.ts`, verify that the `sessionParam` from the URL is passed to `getSessionEvents()` and that events are filtered:

```typescript
// src/api/websocket.ts:27-28
const observables = sessionManagerInstance.getSessionEvents(
  sessionParam,  // ← This should now actually filter
  events
);
```

### Step 5: Verify

```bash
bun run dev &

# Create two sessions
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "session-a"}'

curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "session-b"}'

# Connect WebSocket to session-a only
# Use wscat: wscat -c "ws://localhost:3000/ws?session=session-a&x-api-key=waha"

# Send a message via session-b
# Verify session-a WebSocket does NOT receive session-b events
```

## Done Criteria

- [ ] WebSocket subscribed to `session-a` only receives events from `session-a`
- [ ] Events from `session-b` are NOT delivered to `session-a` subscribers
- [ ] Subscribing without a session name still works (receives all events) for backward compatibility

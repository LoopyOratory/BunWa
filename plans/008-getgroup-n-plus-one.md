# Plan 08: getGroup N+1 Fix

**Finding**: `getGroup(id)` loads ALL groups to find one — O(N) for single group lookup
**Impact**: HIGH — any `/groups/:id` request loads entire groups table
**Effort**: S (hours)
**Risk**: LOW
**Depends on**: None

## Problem

`src/core/engines/noweb/session.noweb.core.ts:1667-1674` — `getGroup(id)` calls `getGroups({})` which fetches ALL groups from DB (or triggers a full network refresh), then indexes by ID.

```typescript
// src/core/engines/noweb/session.noweb.core.ts:1667-1674 — BROKEN
async getGroup(id: string) {
  const groups = await this.getGroups({});  // Loads ALL groups
  return groups.find(g => g.id === id);
}
```

## Scope

- **In scope**: `src/core/engines/noweb/session.noweb.core.ts` (getGroup, getGroupParticipants)
- **Out of scope**: Group listing endpoints, group repository

## Steps

### Step 1: Add direct group lookup to store

In `src/core/engines/noweb/store/NowebPersistentStore.ts`, verify that `groupRepo` has a `getById()` method (it should, since it extends `SqlKVRepository`).

If not, add:
```typescript
async getGroupById(id: string): Promise<Group | null> {
  return this.groupRepo.getById(id);
}
```

### Step 2: Update `getGroup` in session

```typescript
// src/core/engines/noweb/session.noweb.core.ts
async getGroup(id: string) {
  // Try direct lookup first
  const group = await this.store.getGroupById(id);
  if (group) return group;

  // Fallback to full list (for in-memory store)
  const groups = await this.getGroups({});
  return groups.find(g => g.id === id);
}
```

### Step 3: Update `getGroupParticipants` similarly

`getGroupParticipants` at line 1676 calls `getGroup` — once `getGroup` is fixed, this is automatically improved.

### Step 4: Verify

```bash
bun run dev &

# Create session, start it
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "test-group"}'

curl -s -X POST http://localhost:3000/api/sessions/test-group/start \
  -H "x-api-key: waha"

# List groups to get an ID
curl -s http://localhost:3000/api/sessions/test-group/groups \
  -H "x-api-key: waha" | python3 -c "
import sys, json
groups = json.load(sys.stdin)
if groups:
    print(groups[0]['id'])
"

# Get single group by ID — should be fast, not load all
curl -s http://localhost:3000/api/sessions/test-group/groups/<GROUP_ID> \
  -H "x-api-key: waha"
```

## Done Criteria

- [ ] `getGroup(id)` queries by primary key, not full table scan
- [ ] Response time for single group lookup is < 10ms (vs 100ms+ for full load)
- [ ] `getGroupParticipants` also benefits from the fix

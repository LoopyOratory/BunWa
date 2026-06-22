# Plan 09: Chat Overview N+1 Fix

**Finding**: `getChatsOverview` issues N+1 queries — one per chat for contact lookup, profile picture, and last message
**Impact**: HIGH — 50-chat page = 150+ DB queries, sustained load with 3s frontend polling
**Effort**: M (a day)
**Risk**: MED — changing response shape requires frontend coordination
**Depends on**: Plan 03 (session ghost entry should be fixed first)

## Problem

`src/core/engines/noweb/session.noweb.core.ts:1348-1353` — `getChatsOverview` loops over all chats and calls `fetchChatSummary` for each, which internally calls `getContactProfilePicture` (network call) and `getChatMessages` (DB query).

```typescript
// BROKEN: N+1 pattern
for (const chat of chats) {
  const summary = await this.fetchChatSummary(chat);  // N calls
}
```

## Scope

- **In scope**: `src/core/engines/noweb/session.noweb.core.ts` (getChatsOverview, fetchChatSummary)
- **Out of scope**: Frontend chat list (shape should remain compatible), contact repository

## Steps

### Step 1: Batch contact lookups

Replace per-chat `getContactById` calls with a single `whereIn` query:

```typescript
// Before: N queries
const contact = await this.store.getContactById(chat.id);

// After: 1 query
const contactIds = chats.map(c => c.id);
const contacts = await this.store.getContactsByIds(contactIds);
const contactMap = new Map(contacts.map(c => [c.id, c]));
```

### Step 2: Batch profile picture lookups

Use NodeCache (already available) to cache profile picture URLs:

```typescript
// Before: N network calls
const pic = await this.getContactProfilePicture(chat.id, false);

// After: cached, with batch preload
const pics = await this.batchGetProfilePictures(contactIds);
```

### Step 3: Batch last message queries

Replace per-chat `getChatMessages` with a single query using SQL window functions or a batch approach:

```typescript
// Before: N queries
const msgs = await this.getChatMessages(chat.id, { limit: 1 });

// After: 1 query with GROUP BY
const lastMessages = await this.store.getLastMessagesPerChat(contactIds);
```

### Step 4: Verify

```bash
bun run dev &

# Create session with multiple chats
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: waha" \
  -d '{"name": "test-n1"}'

curl -s -X POST http://localhost:3000/api/sessions/test-n1/start \
  -H "x-api-key: waha"

# Time the chat overview request
time curl -s http://localhost:3000/api/sessions/test-n1/chats/overview?limit=50 \
  -H "x-api-key: waha" > /dev/null

# Should be < 100ms instead of 500ms+
```

## Done Criteria

- [ ] `getChatsOverview` uses ≤ 3 DB queries total (contacts + messages + profile pics)
- [ ] Response time for 50-chat page is < 100ms
- [ ] Frontend chat list renders correctly (same JSON shape)
- [ ] No new type errors

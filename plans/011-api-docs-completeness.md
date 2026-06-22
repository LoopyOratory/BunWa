# Plan 11: API Docs Completeness

**Finding**: 43 of 69 endpoints (62%) missing from swagger.ts
**Impact**: HIGH — Scalar docs incomplete, developers can't discover API
**Effort**: M (a day)
**Risk**: LOW — additive changes only
**Depends on**: None

## Problem

`src/swagger.ts` documents ~26 endpoints. The actual route files define ~69 endpoints. This means 62% of the API is invisible in the Scalar docs at `/api-docs/`.

## Scope

- **In scope**: `src/swagger.ts` — add all missing endpoint definitions
- **Out of scope**: Route handlers, frontend, tests

## Missing Endpoints by Route File

### chats.routes.ts (14 endpoints)
- POST `/{session}/chats/overview`
- GET `/{session}/chats/{chatId}`
- DELETE `/{session}/chats/{chatId}`
- GET `/{session}/chats/{chatId}/picture`
- POST `/{session}/chats/{chatId}/messages/read`
- GET `/{session}/chats/{chatId}/messages/{messageId}`
- POST `/{session}/chats/{chatId}/messages/{messageId}/pin`
- POST `/{session}/chats/{chatId}/messages/{messageId}/unpin`
- DELETE `/{session}/chats/{chatId}/messages`
- DELETE `/{session}/chats/{chatId}/messages/{messageId}`
- PUT `/{session}/chats/{chatId}/messages/{messageId}`
- POST `/{session}/chats/{chatId}/archive`
- POST `/{session}/chats/{chatId}/unarchive`
- POST `/{session}/chats/{chatId}/unread`

### chatting.routes.ts (10 endpoints)
- POST `/sendFile`
- POST `/sendVoice`
- POST `/sendVideo`
- POST `/sendPollVote`
- POST `/send/link-custom-preview`
- POST `/sendButtons`
- POST `/sendList`
- POST `/send/buttons/reply`
- GET `/checkNumberStatus`
- GET `/{session}/new-message-id`

### contacts.routes.ts (5 endpoints)
- GET `/contacts/check-exists`
- GET `/contacts/about`
- GET `/contacts/profile-picture`
- POST `/contacts/block`
- POST `/contacts/unblock`

### groups.routes.ts (16 endpoints)
- GET `/{session}/groups/count`
- GET `/{session}/groups/join-info`
- POST `/{session}/groups/join`
- POST `/{session}/groups/refresh`
- DELETE `/{session}/groups/{id}`
- GET `/{session}/groups/{id}/picture`
- PUT `/{session}/groups/{id}/picture`
- DELETE `/{session}/groups/{id}/picture`
- PUT `/{session}/groups/{id}/settings/security/info-admin-only`
- GET `/{session}/groups/{id}/settings/security/info-admin-only`
- PUT `/{session}/groups/{id}/settings/security/messages-admin-only`
- GET `/{session}/groups/{id}/settings/security/messages-admin-only`
- POST `/{session}/groups/{id}/invite-code/revoke`
- GET `/{session}/groups/{id}/participants/v2`
- POST `/{session}/groups/{id}/admin/promote`
- POST `/{session}/groups/{id}/admin/demote`

### channels.routes.ts (6 endpoints)
- GET `/{session}/channels/{id}/messages/preview`
- POST `/{session}/channels/search/by-view`
- POST `/{session}/channels/search/by-text`
- GET `/{session}/channels/search/views`
- GET `/{session}/channels/search/countries`
- GET `/{session}/channels/search/categories`

### profile.routes.ts (2 endpoints)
- PUT `/{session}/profile/picture`
- DELETE `/{session}/profile/picture`

### screenshot.routes.ts (1 endpoint)
- GET `/{session}/screenshot`

### media.routes.ts (2 endpoints)
- POST `/{session}/media/convert/voice`
- POST `/{session}/media/convert/video`

### events.routes.ts (1 endpoint)
- POST `/{session}/events`

### workers.routes.ts (1 endpoint)
- GET `/workers`

### contacts.session.routes.ts (2 endpoints — dead code, skip)
- GET `/{session}/contacts/{id}`
- PUT `/{session}/contacts/{chatId}`

## Steps

### Step 1: Add missing tags to swagger.ts
Add `🔗 LIDs` tag. Remove `📅 Events` and `🖼️ Media` tags or add their paths.

### Step 2: Add all missing endpoint definitions
For each endpoint above, add the OpenAPI path definition with:
- Correct HTTP method and path
- Correct tag
- Request body schema (if POST/PUT)
- Path parameters
- Response description

### Step 3: Fix existing schemas
- Add `reply_to` to `sendText` request body
- Add `file.data` to `sendImage` schema

### Step 4: Verify
```bash
curl http://localhost:3000/api-docs | grep -c "operationId"
# Expected: ~69 (up from ~26)
```

## Done Criteria

- [ ] All 69 endpoints documented in swagger.ts
- [ ] No missing tags
- [ ] Scalar docs load without errors
- [ ] `sendText` schema includes `reply_to`

## Maintenance Note

When adding new endpoints to `src/api/*.routes.ts`, always add corresponding entry to `src/swagger.ts`.

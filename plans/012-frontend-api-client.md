# Plan 12: Frontend API Client Completeness

**Finding**: Frontend API client has only 14 of ~69 endpoints
**Impact**: HIGH — Chat UI can't call most backend APIs
**Effort**: M (a day)
**Risk**: LOW — additive changes only
**Depends on**: None

## Problem

`frontend/src/lib/api.ts` exposes only 14 methods. The backend has ~69 endpoints. This means the Chat UI, Sessions page, and other pages can't access most features.

## Scope

- **In scope**: `frontend/src/lib/api.ts` — add all missing API methods
- **Out of scope**: Backend routes, swagger, tests

## Missing API Methods

### Chatting (12 methods)
- `sendFile(session, chatId, file)` — POST /api/sendFile
- `sendVoice(session, chatId, file)` — POST /api/sendVoice
- `sendVideo(session, chatId, file, caption)` — POST /api/sendVideo
- `sendLocation(session, chatId, lat, lng, title)` — POST /api/sendLocation
- `sendPoll(session, chatId, poll)` — POST /api/sendPoll
- `sendPollVote(session, chatId, pollMessageId, votes)` — POST /api/sendPollVote
- `sendContactVcard(session, chatId, contacts)` — POST /api/sendContactVcard
- `startTyping(session, chatId)` — POST /api/startTyping
- `stopTyping(session, chatId)` — POST /api/stopTyping
- `setReaction(session, chatId, messageId, emoji)` — PUT /api/reaction
- `setStar(session, chatId, messageId, starred)` — PUT /api/star
- `forwardMessage(session, chatId, messageId)` — POST /api/forwardMessage

### Chats (10 methods)
- `deleteChat(session, chatId)` — DELETE /api/{session}/chats/{chatId}
- `getChatPicture(session, chatId)` — GET /api/{session}/chats/{chatId}/picture
- `readChatMessages(session, chatId)` — POST /api/{session}/chats/{chatId}/messages/read
- `editMessage(session, chatId, messageId, text)` — PUT /api/{session}/chats/{chatId}/{messageId}
- `deleteMessage(session, chatId, messageId)` — DELETE /api/{session}/chats/{chatId}/{messageId}
- `pinMessage(session, chatId, messageId)` — POST /api/{session}/chats/{chatId}/{messageId}/pin
- `unpinMessage(session, chatId, messageId)` — POST /api/{session}/chats/{chatId}/{messageId}/unpin
- `archiveChat(session, chatId)` — POST /api/{session}/chats/{chatId}/archive
- `unarchiveChat(session, chatId)` — POST /api/{session}/chats/{chatId}/unarchive
- `unreadChat(session, chatId)` — POST /api/{session}/chats/{chatId}/unread

### Contacts (5 methods)
- `getContacts(session, limit, offset)` — GET /api/contacts/all
- `getContact(session, contactId)` — GET /api/contacts
- `checkNumberExists(session, phone)` — GET /api/contacts/check-exists
- `blockContact(session, contactId)` — POST /api/contacts/block
- `unblockContact(session, contactId)` — POST /api/contacts/unblock

### Groups (8 methods)
- `getGroups(session)` — GET /api/{session}/groups
- `createGroup(session, name, participants)` — POST /api/{session}/groups
- `leaveGroup(session, id)` — POST /api/{session}/groups/{id}/leave
- `getGroupParticipants(session, id)` — GET /api/{session}/groups/{id}/participants
- `addParticipants(session, id, participants)` — POST /api/{session}/groups/{id}/participants/add
- `removeParticipants(session, id, participants)` — POST /api/{session}/groups/{id}/participants/remove
- `setDescription(session, id, description)` — PUT /api/{session}/groups/{id}/description
- `setSubject(session, id, subject)` — PUT /api/{session}/groups/{id}/subject

### Channels (4 methods)
- `getChannels(session)` — GET /api/{session}/channels
- `getChannel(session, id)` — GET /api/{session}/channels/{id}
- `followChannel(session, id)` — POST /api/{session}/channels/{id}/follow
- `unfollowChannel(session, id)` — POST /api/{session}/channels/{id}/unfollow

### Labels (4 methods)
- `getLabels(session)` — GET /api/{session}/labels
- `createLabel(session, label)` — POST /api/{session}/labels
- `deleteLabel(session, id)` — DELETE /api/{session}/labels/{id}
- `putLabelsToChat(session, chatId, labels)` — PUT /api/{session}/labels/chats/{chatId}

### Profile (3 methods)
- `getProfile(session)` — GET /api/{session}/profile
- `setProfileName(session, name)` — PUT /api/{session}/profile/name
- `setProfileStatus(session, status)` — PUT /api/{session}/profile/status

### Presence (2 methods)
- `setPresence(session, presence, chatId)` — POST /api/{session}/presence
- `getPresences(session)` — GET /api/{session}/presence

## Steps

### Step 1: Add all missing methods to api.ts
Follow existing pattern: each method is an arrow function that calls `request<T>()`.

### Step 2: Update TypeScript interfaces
Add missing interfaces: Group, Channel, Label, Presence, etc.

### Step 3: Verify
```bash
cd frontend && bun run build
# Expected: no type errors
```

## Done Criteria

- [ ] All ~69 backend endpoints have corresponding frontend API methods
- [ ] TypeScript interfaces for all response types
- [ ] Frontend builds without errors

## Maintenance Note

When adding new backend endpoints, always add corresponding frontend API method.

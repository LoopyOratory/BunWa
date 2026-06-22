# Plan 13: Chat UI Features

**Finding**: Chat UI missing typing, reactions, reply, media, auto-refresh
**Impact**: HIGH — Chat is core feature, currently text-only
**Effort**: L (multi-day)
**Risk**: MED — affects core chat flow
**Depends on**: Plan 12 (frontend API client must be complete first)

## Problem

The chat page (`frontend/src/pages/chat-page.tsx`) only supports sending text messages. All other WhatsApp features are missing from the UI.

## Scope

- **In scope**: `frontend/src/pages/chat-page.tsx`, new components
- **Out of scope**: Backend routes, API docs

## Features to Implement

### 1. Typing Indicators (S effort)
- Call `startTyping()` when user types in message input
- Call `stopTyping()` after 3 seconds of no typing
- Debounce typing events

### 2. Message Reactions (M effort)
- Add long-press/right-click context menu on messages
- Add emoji picker component
- Call `setReaction()` when emoji selected
- Display existing reactions on messages

### 3. Reply to Messages (S effort)
- Add reply button on message hover/context menu
- Show quoted message preview above input
- Call `sendText()` with `reply_to` parameter
- Display replied-to message in message bubble

### 4. Message Context Menu (M effort)
- Create `MessageContextMenu` component
- Options: Reply, React, Edit, Delete, Pin, Forward, Star
- Show on long-press (mobile) or right-click (desktop)

### 5. Auto-refresh Messages (S effort)
- Poll `getMessages()` every 5 seconds when chat is open
- Only fetch new messages (use last message timestamp)
- Append new messages to list without full reload

### 6. Scroll-to-Bottom Button (S effort)
- Show floating button when scrolled up
- Click scrolls to latest messages
- Auto-scroll on new messages if already at bottom

### 7. Date Separators (S effort)
- Group messages by date
- Show date separator between different days
- Format: "Today", "Yesterday", "Mon Jan 15"

### 8. Media Message Rendering (M effort)
- Detect `hasMedia` flag on messages
- Render images inline with click-to-expand
- Show audio player for voice messages
- Show video player for video messages
- Show file icon for documents

### 9. Message Edit/Delete UI (S effort)
- Edit: Show input pre-filled with message text
- Delete: Confirmation dialog
- Pin/Unpin: Toggle with visual indicator

### 10. Ack Tooltips (S effort)
- Add tooltip to Clock icon: "Sending"
- Add tooltip to single Check: "Sent"
- Add tooltip to double Check: "Delivered"
- Add tooltip to blue double Check: "Read"

## Steps

### Step 1: Create MessageContextMenu component
```tsx
// frontend/src/components/message-context-menu.tsx
interface MessageContextMenuProps {
  message: Message
  onReply: () => void
  onReact: (emoji: string) => void
  onEdit: () => void
  onDelete: () => void
  onPin: () => void
  onStar: () => void
}
```

### Step 2: Create EmojiPicker component
```tsx
// frontend/src/components/emoji-picker.tsx
interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}
```

### Step 3: Add typing indicator logic to ChatPage
```tsx
// In message input onChange:
const handleTyping = () => {
  api.startTyping(selectedSession, selectedChat.id)
  clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => {
    api.stopTyping(selectedSession, selectedChat.id)
  }, 3000)
}
```

### Step 4: Add reply state and UI
```tsx
const [replyingTo, setReplyingTo] = useState<Message | null>(null)
// Show quoted message above input when replyingTo is set
```

### Step 5: Add auto-refresh
```tsx
useEffect(() => {
  if (!selectedChat || !isWorking) return
  const interval = setInterval(() => {
    loadMessages(selectedChat.id)
  }, 5000)
  return () => clearInterval(interval)
}, [selectedChat, isWorking])
```

### Step 6: Add date separators
```tsx
function DateSeparator({ date }: { date: Date }) {
  const label = isToday(date) ? 'Today' : 
                isYesterday(date) ? 'Yesterday' : 
                format(date, 'EEE, MMM d')
  return <div className="text-center text-xs text-muted-foreground py-2">{label}</div>
}
```

### Step 7: Add scroll-to-bottom button
```tsx
const [showScrollButton, setShowScrollButton] = useState(false)
// On scroll: check if near bottom
// Show button if not at bottom
```

### Step 8: Add media rendering
```tsx
function MediaMessage({ message }: { message: Message }) {
  if (message.hasMedia) {
    // Render based on mimetype
    // image/* → <img>
    // audio/* → <audio>
    // video/* → <video>
    // application/* → file icon + download
  }
}
```

### Step 9: Verify
```bash
cd frontend && bun run build
# Expected: no errors

# Manual testing:
# 1. Send message → verify appears immediately
# 2. Type → verify remote sees "typing..."
# 3. Right-click message → verify context menu appears
# 4. Reply → verify quoted message shows
# 5. Receive message → verify auto-refresh shows it
```

## Done Criteria

- [ ] Typing indicators work (send and display)
- [ ] Message reactions work (emoji picker + display)
- [ ] Reply to messages works (quoted preview + send)
- [ ] Context menu on messages (Reply, React, Edit, Delete, Pin, Star)
- [ ] Messages auto-refresh every 5 seconds
- [ ] Scroll-to-bottom button appears when scrolled up
- [ ] Date separators between message groups
- [ ] Media messages render (images, audio, video, files)
- [ ] Ack tooltips explain delivery status
- [ ] Frontend builds without errors

## Maintenance Note

New chat features should follow the existing component pattern: small, focused components in `frontend/src/components/`, imported into `chat-page.tsx`.

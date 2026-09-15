---
type: note
section: mcp
tags: [bunwa, mcp, reference, ai]
updated: 2026-09-14
source: src/mcp/tools/*.ts
status: shipped
tools: 43
---

# 🧰 MCP Tools Reference

All **43** tools, grouped by category, with the file each defines and its policy tier.
Everything is `sessionScoped` **except `SessionList`**; `sessionId` is a parameter on every
session-scoped tool.

Legend — Tier: `read` = `readOnlyHint`, filtered out by `MCP_READONLY`; `write` = mutating.
⚠️ = destructive (needs `destructiveOps: true` in the session MCP policy).

## Session — `src/mcp/tools/session.tools.ts` (6)

| Tool | Tier | Scoped | Notes |
|---|---|---|---|
| `SessionList` | read | no | the only unscoped tool; per-session keys may **not** call it |
| `SessionGet` | read | ✅ | status + config |
| `SessionStart` | write | ✅ | starts, returns QR info if pairing is needed |
| `SessionStop` | write | ✅ | graceful stop |
| `SessionRestart` | write | ✅ | |
| `SessionCheckNumber` | read | ✅ | LID-aware registered-on-WhatsApp check |

## Message — `src/mcp/tools/message.tools.ts` (20)

| Tool | Tier | Notes |
|---|---|---|
| `MessageSendText` | write | |
| `MessageSendImage` | write | |
| `MessageSendFile` | write | |
| `MessageSendVoice` | write | |
| `MessageSendVideo` | write | |
| `MessageSendLocation` | write | |
| `MessageSendPoll` | write | |
| `MessageSendContactVCard` | write | |
| `MessageSendLinkPreview` | write | |
| `MessageSendButtons` | write | header media needs Plus |
| `MessageSendList` | write | |
| `MessageReply` | write | quoted reply |
| `MessageForward` | write | |
| `MessageReact` | write | |
| `MessageStar` | write | |
| `MessageMarkRead` | write | |
| `MessageStartTyping` | write | |
| `MessageStopTyping` | write | |
| `MessageVotePoll` | write | vote in someone else's poll |
| `MessageGenerateId` | read | mint a message id up front |

## Chat — `src/mcp/tools/chat.tools.ts` (5 + 1 contact)

| Tool | Tier | Category | Notes |
|---|---|---|---|
| `ChatGetMessages` | read | chat | history for a chat |
| `ChatGetMessage` | read | chat | single message |
| `ChatMarkMessagesRead` | write | chat | |
| `ChatPinMessage` | write | chat | pin / unpin |
| `ChatSetLabels` | write | chat | assign labels (colour caveat — [[Channels and Labels]]) |
| `ContactFindPhoneByLid` | read | **contact** | lives in `chat.tools.ts` but is categorised as a contact tool |

## Contact — `src/mcp/tools/contact.tools.ts` (1)

| Tool | Tier | Notes |
|---|---|---|
| `ContactCheckNumber` | read | |

## Status — `src/mcp/tools/status.tools.ts` (6)

| Tool | Tier | Notes |
|---|---|---|
| `StatusSendText` | write | |
| `StatusSendImage` | write | |
| `StatusSendVoice` | write | duration computed by the engine |
| `StatusSendVideo` | write | |
| `StatusDelete` | write | ⚠️ **the only `destructive: true` tool** — blocked unless the session sets `destructiveOps: true` |
| `StatusGenerateId` | read | |

## Presence — `src/mcp/tools/presence.tools.ts` (4)

| Tool | Tier | Notes |
|---|---|---|
| `PresenceGetAll` | read | |
| `PresenceSet` | write | set your own presence |
| `PresenceGetForChat` | read | |
| `PresenceSubscribe` | write | subscribe to a chat's presence updates |

## Category gaps

`ToolCategory` in the type definitions also declares **`'group'`** and **`'media'`**, but **no tool
uses them** — group management has no MCP surface today. That is the most obvious next addition
([[Roadmap]]).

## Policy recap

- `MCP_READONLY=true` → only `tier: read` tools are registered.
- `allowedTools` / `deniedTools` accept **tool names or category names**; deny wins; a non-empty
  allow-list turns into "only these".
- Destructive tools additionally require `destructiveOps: true` ([[MCP Server#Per-session policy]]).

## Related

[[MCP Server]] · [[Endpoints by Domain#Sessions & auth]] · [[Known Gaps and Stubs]] · [[Roadmap]]

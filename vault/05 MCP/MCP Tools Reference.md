---
type: note
section: mcp
tags: [bunwa, mcp, reference, ai]
updated: 2026-10-04
source: src/mcp/tools/*.ts
status: shipped
tools: 80
---

# 🧰 MCP Tools Reference

All **80** tools, grouped by category, with the file each defines and its policy tier.
Everything is `sessionScoped` **except `SessionList`**; `sessionId` is a parameter on every
session-scoped tool.

The list is built in one place, `buildAllTools()` in `src/mcp/tools/index.ts`, which the MCP
server and the dashboard's tool endpoint both call. They used to keep separate lists, so a
family added to one was missing from the other: that is how the `group` category was advertised
with no tools in it, and why the new channel tools would not have appeared in the dashboard.

Legend — Tier: `read` = `readOnlyHint`, filtered out by `MCP_READONLY`; `write` = mutating.
⚠️ = destructive (needs `destructiveOps: true` in the session MCP policy).

## Group — `src/mcp/tools/group.tools.ts` (14)

Added 2026-10-04, wrapping the engine methods the REST group routes use. Participants are chat
id strings (`15551234567` or `15551234567@c.us`). `GroupGet` answers the mapped `GroupInfo`;
`GroupList` answers the store's own keyed-by-id shape, matching the REST list route.

| Tool | Tier | Notes |
|---|---|---|
| `GroupList` · `GroupGet` · `GroupGetParticipants` · `GroupGetInviteCode` | read | |
| `GroupCreate` | write | the session account becomes owner |
| `GroupAddParticipants` · `GroupPromoteParticipants` · `GroupDemoteParticipants` | write | |
| `GroupRemoveParticipants` | write ⚠️ | removes access immediately |
| `GroupSetSubject` · `GroupSetDescription` · `GroupRefresh` | write | |
| `GroupRevokeInviteCode` · `GroupLeave` | write ⚠️ | |

## Channel — `src/mcp/tools/channel.tools.ts` (10)

Added 2026-10-04, same day the channel routes were verified live.

| Tool | Tier | Notes |
|---|---|---|
| `ChannelList` · `ChannelGet` · `ChannelSearchByText` · `ChannelSearchByView` | read | `ChannelSearchByText` is the working search; WhatsApp refuses `by-view` for every view value |
| `ChannelFollow` · `ChannelUnfollow` · `ChannelMute` · `ChannelUnmute` · `ChannelCreate` | write | |
| `ChannelDelete` | write ⚠️ | |

## Media — `src/mcp/tools/media.tools.ts` (3)

Added 2026-10-04. The REST surface could download a message's media and serve a stored file, and
the MCP could neither, so an agent could send a picture but not read one back. The download URL is
served under `/api` and needs the API key, so these return the bytes as base64 as well: an agent
can pass the result straight to `MessageSendImage`, `MessageSendFile`, `MessageSendVoice` or
`MessageSendVideo`, whose descriptions now say they accept a URL, a data URL, a base64 string or a
local path. Large results arrive as an MCP resource (`mcp://toolResult/<id>.json`) rather than
inline text, which is how the rest of the registry behaves.

| Tool | Tier | Notes |
|---|---|---|
| `MediaDownloadMessage` | read | mirrors `GET /chats/{chatId}/messages/{messageId}/media`; `includeData: false` for metadata only, `maxBytes` caps the payload (default 8 MiB) |
| `MediaGetFile` | read | mirrors `GET /api/files/{session}/{filename}`; the same path-traversal guards as the route |
| `MediaConvertVoice` | write | mirrors `POST /media/convert/voice`; needs ffmpeg, an Ogg/Opus input is returned unchanged |

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
| `StatusDelete` | write | ⚠️ destructive — blocked unless the session sets `destructiveOps: true` |
| `StatusGenerateId` | read | |

## Presence — `src/mcp/tools/presence.tools.ts` (4)

| Tool | Tier | Notes |
|---|---|---|
| `PresenceGetAll` | read | |
| `PresenceSet` | write | set your own presence |
| `PresenceGetForChat` | read | |
| `PresenceSubscribe` | write | subscribe to a chat's presence updates |

## Sending policy — `src/mcp/tools/policy.tools.ts` (3)

| Tool | Tier | Scoped | Notes |
|---|---|---|---|
| `SendingPolicyGet` | read | ✅ | overrides + bypassed + live usage for a session |
| `SendingPolicySet` | write ⚠️ | ✅ | replaces the session's overrides wholesale (send none to clear). Destructive: it can weaken anti-ban limits, so it needs `destructiveOps: true` |
| `SendingPolicyUsage` | read | ✅ | sliding-window counts, effective caps, warm-up, next allowed times |

## Templates — `src/mcp/tools/template.tools.ts` (7)

| Tool | Tier | Scoped | Notes |
|---|---|---|---|
| `TemplateList` | read | ✅ | includes the `{{variables}}` each template needs |
| `TemplateGet` | read | ✅ | by id or name |
| `TemplateCreate` | write | ✅ | |
| `TemplateUpdate` | write | ✅ | id only; only the fields sent change |
| `TemplatePreview` | read | ✅ | render without sending |
| `TemplateSend` | write | ✅ | render + send to a chat; session must be running |
| `TemplateDelete` | write ⚠️ | ✅ | needs `destructiveOps: true` |

## Category gaps

`ToolCategory` in the type definitions also declares **`'group'`** and **`'media'`**, but **no tool
uses them** — group management has no MCP surface today. That is the most obvious next addition
([[Roadmap]]).

## Policy recap

- `MCP_ENABLED=false` → the endpoint is not mounted at all (404).
- `MCP_READONLY=true` → only `tier: read` tools are registered.
- `allowedTools` / `deniedTools` accept **tool names or category names**; deny wins; a non-empty
  allow-list turns into "only these".
- Destructive tools additionally require `destructiveOps: true` ([[MCP Server#Per-session policy]]).

## Related

[[MCP Server]] · [[Endpoints by Domain#Sessions & auth]] · [[Known Gaps and Stubs]] · [[Roadmap]]

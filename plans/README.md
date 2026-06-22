# Improvement Plans — waha-bun

**Generated against**: commit HEAD (no git repo — snapshot of working tree)
**Last audit**: 2026-06-15

## Priority Order

| # | Plan | Finding | Impact | Effort | Status |
|---|------|---------|--------|--------|--------|
| 01 | [Path traversal fix](001-path-traversal-fix.md) | Path traversal in `/ui/` static serving | CRITICAL | S | DONE |
| 02 | [WebSocket authentication](002-websocket-auth.md) | WebSocket `/ws` has no auth | HIGH | S | DONE |
| 03 | [Session ghost entry fix](003-session-ghost-entry.md) | Session start failure leaves ghost in map | HIGH | S | DONE |
| 04 | [Session-scoped events](004-session-scoped-events.md) | `getSessionEvents()` ignores session param | HIGH | M | DONE |
| 05 | [StatusTracker reset on restart](005-status-tracker-reset.md) | Counts never reset on session restart | MED | S | DONE |
| 06 | [Exception handler completeness](006-exception-handler.md) | `AvailableInPlusVersionAll` not handled | MED | S | DONE |
| 07 | [Fake activity timestamp](007-fake-activity-timestamp.md) | `getSessions()` returns `Date.now()` as activity | MED | S | DONE |
| 08 | [getGroup N+1 fix](008-getgroup-n-plus-one.md) | `getGroup(id)` loads ALL groups | HIGH | S | DONE |
| 09 | [Chat overview N+1 fix](009-chat-overview-n-plus-one.md) | N+1 queries in `getChatsOverview` | HIGH | M | DONE |
| 10 | [Test infrastructure](010-test-infrastructure.md) | Zero test files | HIGH | L | DONE |
| 11 | [API docs completeness](011-api-docs-completeness.md) | 43 of 69 endpoints missing from swagger | HIGH | M | TODO |
| 12 | [Frontend API client](012-frontend-api-client.md) | Only 14 of 69 endpoints in frontend client | HIGH | M | TODO |
| 13 | [Chat UI features](013-chat-ui-features.md) | Chat missing typing, reactions, reply, media | HIGH | L | TODO |

## Dependencies

```
01-10 — DONE
11 (API docs) — independent
12 (Frontend API client) — independent
13 (Chat UI features) — depends on 12
```

## Completed Plans (01-10)

All 10 initial improvement plans have been implemented:
- Path traversal fix with `isPathSafe()` validation
- WebSocket API key authentication
- Session ghost entry fix with proper cleanup
- Session-scoped events via `getEventObservable()`
- StatusTracker reset on restart
- Exception handler for `AvailableInPlusVersionAll`
- Real activity timestamps
- O(1) group lookup with `getGroupById()`
- Batch contact lookups for chat overview
- Test infrastructure with 8 passing tests

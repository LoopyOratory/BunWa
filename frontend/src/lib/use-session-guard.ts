import { useCallback, useRef } from "react"

/**
 * Guards a session-scoped read against a stale answer.
 *
 * The chat page loads chats, messages and contacts per session, and switching
 * sessions starts a fresh load while the previous one may still be in flight.
 * Whichever answer arrives last used to win, so with two sessions running the
 * previous session's chats (and its contact names) landed in the newly
 * selected session's view. Capture the session a request was issued for, then
 * drop the answer once the selection has moved on.
 *
 * Usage:
 *   const isCurrentSession = useSessionGuard(selectedSession)
 *   const session = selectedSession
 *   const list = await api.getChatsOverview(session)
 *   if (!isCurrentSession(session)) return
 *   setChats(list)
 */
export function useSessionGuard(selectedSession: string) {
  const current = useRef(selectedSession)
  current.current = selectedSession
  return useCallback((session: string) => session === current.current, [])
}

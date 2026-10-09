import { useMemo } from "react"
import type { Contact } from "@/lib/api"
import type { ChatMessageData } from "@/components/ui/chat"
import { mapMessage } from "@/components/chat/helpers"
import type { ThreadMessage } from "./use-chat-thread"

type Cached = {
  data: ChatMessageData
  starred: boolean
  contacts: Map<string, Contact>
  currentUserJid: string
}

/* Keyed by the message object itself, so entries go away with the messages.
   An entry is reused only while the inputs that shape the bubble match. */
const cache = new WeakMap<ThreadMessage, Cached>()

/**
 * Map API messages to chat bubbles, oldest first.
 *
 * Each message object is mapped once and the result reused while the message
 * object is unchanged, so the memoized bubbles only re-render for the message
 * that actually changed. A cached bubble is rebuilt when contacts or the
 * account change, since names and "you" come from them.
 */
export function useMappedMessages(
  messages: ThreadMessage[],
  contacts: Map<string, Contact>,
  currentUserJid: string,
  starred: Set<string>,
): ChatMessageData[] {
  return useMemo(() => {
    const out: ChatMessageData[] = new Array(messages.length)
    for (let i = 0; i < messages.length; i++) {
      const message = messages[messages.length - 1 - i]
      const isStarred = starred.has(message.id)
      const hit = cache.get(message)
      if (hit && hit.starred === isStarred && hit.contacts === contacts && hit.currentUserJid === currentUserJid) {
        out[i] = hit.data
        continue
      }
      const base = mapMessage(message, contacts, currentUserJid)
      const data: ChatMessageData = {
        ...base,
        isStarred,
        ...(message.sendError
          ? { status: "failed" as const, error: message.sendError }
          : message.pending
            ? { status: "sending" as const }
            : {}),
      }
      cache.set(message, { data, starred: isStarred, contacts, currentUserJid })
      out[i] = data
    }
    return out
  }, [messages, contacts, currentUserJid, starred])
}

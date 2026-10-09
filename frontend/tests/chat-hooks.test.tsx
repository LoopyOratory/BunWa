import "./setup-dom"
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

/*
 * The chat page's data hooks. These pin the behaviour the rework was for:
 * no cross-session leaks, list rows patched in place instead of refetched,
 * pictures asked for once, and failed sends kept in the thread.
 */

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class FakeApiError extends Error {
  status: number
  retryAfterSeconds?: number
  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const calls = {
  overview: [] as Array<{ session: string; limit: number; offset: number; reply: Deferred<unknown[]> }>,
  pictures: [] as string[],
  messages: [] as Array<{ chatId: string; offset: number; reply: Deferred<unknown[]> }>,
  sendText: [] as Array<{ text: string; reply: Deferred<unknown> }>,
}

const fakeApi = {
  getChatsOverview: (session: string, limit = 50, offset = 0) => {
    const reply = deferred<unknown[]>()
    calls.overview.push({ session, limit, offset, reply })
    return reply.promise
  },
  getContactPicture: async (_session: string, id: string) => {
    calls.pictures.push(id)
    return { profilePictureURL: null }
  },
  getMessages: (_session: string, chatId: string, _limit = 50, offset = 0) => {
    const reply = deferred<unknown[]>()
    calls.messages.push({ chatId, offset, reply })
    return reply.promise
  },
  sendText: (_session: string, _chatId: string, text: string) => {
    const reply = deferred<unknown>()
    calls.sendText.push({ text, reply })
    return reply.promise
  },
  sendSeen: async () => ({}),
}

// mock.module is process-wide in bun test, so keep every real export (other
// test files use getApiAuthHeaders) and replace only what these hooks call.
const realApi = await import("../src/lib/api")
mock.module("../src/lib/api", () => ({
  ...realApi,
  // fakeApi itself (tests swap its methods); anything else falls back to the real client.
  api: Object.setPrototypeOf(fakeApi, realApi.api),
  ApiError: FakeApiError,
  fetchImageBlobUrl: async () => null,
}))

const { useChatList } = await import("../src/hooks/chat/use-chat-list")
const { useAvatars } = await import("../src/hooks/chat/use-avatars")
const { useChatThread } = await import("../src/hooks/chat/use-chat-thread")

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  calls.overview = []
  calls.pictures = []
  calls.messages = []
  calls.sendText = []
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** Render a hook and expose its latest value. */
function renderHook<P, R>(hook: (props: P) => R, initial: P) {
  const result: { current: R } = { current: undefined as R }
  function Harness({ props }: { props: P }) {
    result.current = hook(props)
    return null
  }
  act(() => root.render(<Harness props={initial} />))
  return {
    result,
    rerender: (props: P) => act(() => root.render(<Harness props={props} />)),
  }
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

const chat = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, ...extra })
const message = (id: string, from: string, fromMe = false, timestamp = 1000) => ({
  id, from, to: fromMe ? from : "me@c.us", fromMe, body: id, timestamp, hasMedia: false, ack: 1, ackName: "SERVER",
})

describe("useChatList", () => {
  test("an answer for a session the user has left is dropped", async () => {
    const { result, rerender } = renderHook(({ s }: { s: string }) => useChatList(s, true), { s: "alpha" })
    rerender({ s: "beta" })
    const [alphaCall, betaCall] = calls.overview
    expect(alphaCall.session).toBe("alpha")
    expect(betaCall.session).toBe("beta")

    await act(async () => betaCall.reply.resolve([chat("b1@c.us")]))
    await act(async () => alphaCall.reply.resolve([chat("a1@c.us")]))

    expect(result.current.chats.map((c) => c.id)).toEqual(["b1@c.us"])
  })

  test("a live message moves its chat to the top and counts as unread unless open", async () => {
    const { result } = renderHook(() => useChatList("alpha", true), undefined)
    await act(async () => calls.overview[0].reply.resolve([chat("a@c.us"), chat("b@c.us")]))

    act(() => result.current.applyMessage(message("m1", "b@c.us") as never, null))
    expect(result.current.chats.map((c) => c.id)).toEqual(["b@c.us", "a@c.us"])
    expect(result.current.chats[0].unreadCount).toBe(1)
    expect(result.current.chats[0].lastMessage?.body).toBe("m1")

    act(() => result.current.applyMessage(message("m2", "a@c.us", false, 1001) as never, "a@c.us"))
    expect(result.current.chats[0].id).toBe("a@c.us")
    expect(result.current.chats[0].unreadCount ?? 0).toBe(0)

    act(() => result.current.markRead("b@c.us"))
    expect(result.current.chats.find((c) => c.id === "b@c.us")?.unreadCount).toBe(0)
    // No refetch for any of this.
    expect(calls.overview).toHaveLength(1)
  })

  test("reads the store's unread count, and -1 (marked unread) as 1", async () => {
    const { result } = renderHook(() => useChatList("alpha", true), undefined)
    await act(async () =>
      calls.overview[0].reply.resolve([chat("a@c.us", { _chat: { unreadCount: 3 } }), chat("b@c.us", { _chat: { unreadCount: -1 } })]),
    )
    expect(result.current.chats.map((c) => c.unreadCount)).toEqual([3, 1])
  })

  test("loads the next page from the current length", async () => {
    const { result } = renderHook(() => useChatList("alpha", true), undefined)
    const first = Array.from({ length: 50 }, (_, i) => chat(`c${i}@c.us`))
    await act(async () => calls.overview[0].reply.resolve(first))
    expect(result.current.hasMore).toBe(true)

    act(() => void result.current.loadMore())
    expect(calls.overview[1]).toMatchObject({ limit: 50, offset: 50 })
    await act(async () => calls.overview[1].reply.resolve([chat("c50@c.us"), chat("c0@c.us")]))
    expect(result.current.chats).toHaveLength(51)
    expect(result.current.hasMore).toBe(false)
  })
})

describe("useAvatars", () => {
  test("asks for a chat's picture once, even when it has none", async () => {
    const { result } = renderHook(() => useAvatars("alpha"), undefined)
    act(() => result.current.request(["a@c.us", "b@c.us"]))
    await flush()
    act(() => result.current.request(["a@c.us", "b@c.us"]))
    act(() => result.current.request(["a@c.us"]))
    await flush()
    expect(calls.pictures.sort()).toEqual(["a@c.us", "b@c.us"])
  })

  test("runs at most four lookups at a time", async () => {
    let inFlight = 0
    let peak = 0
    const gates: Array<() => void> = []
    fakeApi.getContactPicture = async (_s: string, id: string) => {
      calls.pictures.push(id)
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise<void>((r) => gates.push(r))
      inFlight--
      return { profilePictureURL: null }
    }
    const { result } = renderHook(() => useAvatars("alpha"), undefined)
    act(() => result.current.request(Array.from({ length: 10 }, (_, i) => `c${i}@c.us`)))
    expect(calls.pictures).toHaveLength(4)
    while (gates.length) {
      await act(async () => {
        gates.shift()!()
        await Promise.resolve()
        await Promise.resolve()
      })
    }
    expect(peak).toBe(4)
    expect(calls.pictures).toHaveLength(10)
  })
})

describe("useChatThread", () => {
  test("a failed send stays in the thread with its reason, and Retry resends it", async () => {
    const { result } = renderHook(() => useChatThread("alpha", "a@c.us", "me@c.us"), undefined)
    await act(async () => calls.messages[0].reply.resolve([message("old", "a@c.us")]))

    act(() => void result.current.sendText("hello"))
    expect(result.current.messages[0].pending?.text).toBe("hello")

    await act(async () => {
      calls.sendText[0].reply.reject(new FakeApiError("Send blocked by the sending policy: Quiet hours are in effect (22:00-07:00). Retry after 300 seconds", 429, 300))
    })
    const failed = result.current.messages[0]
    expect(failed.sendError).toBe("Not sent: Quiet hours are in effect (22:00-07:00), retry in 5 min")
    expect(result.current.messages).toHaveLength(2)

    act(() => result.current.retry(failed.id))
    expect(calls.sendText).toHaveLength(2)
    await act(async () => calls.sendText[1].reply.resolve({ id: "real-1" }))
    expect(result.current.messages[0].id).toBe("real-1")
    expect(result.current.messages[0].sendError).toBeUndefined()
    expect(result.current.messages).toHaveLength(2)
  })

  test("a tick changes only its own message object", async () => {
    const { result } = renderHook(() => useChatThread("alpha", "a@c.us", "me@c.us"), undefined)
    await act(async () => calls.messages[0].reply.resolve([message("m2", "a@c.us"), message("m1", "a@c.us")]))
    const [before2, before1] = result.current.messages
    act(() => result.current.applyEvent("message.ack", { id: "m1", ack: 3, ackName: "READ" }))
    const [after2, after1] = result.current.messages
    expect(after2).toBe(before2)
    expect(after1).not.toBe(before1)
    expect(after1.ack).toBe(3)
  })

  test("older history is requested from the confirmed message count", async () => {
    const { result } = renderHook(() => useChatThread("alpha", "a@c.us", "me@c.us"), undefined)
    const page = Array.from({ length: 50 }, (_, i) => message(`m${i}`, "a@c.us"))
    await act(async () => calls.messages[0].reply.resolve(page))
    act(() => void result.current.sendText("pending one"))
    act(() => void result.current.loadOlder())
    expect(calls.messages[1].offset).toBe(50)
  })
})

import "./setup-dom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useWebSocket } from "../src/lib/use-websocket"

/* ── Fake WebSocket ────────────────────────────────────────────────────────
   Records every construction and keeps close() synchronous so a cleanup close
   immediately reaches onclose, exactly where the reconnect loop starts. */
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  url: string
  readyState = FakeWebSocket.CONNECTING
  closeCalls = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      if (this.readyState === FakeWebSocket.CONNECTING) {
        this.readyState = FakeWebSocket.OPEN
        this.onopen?.()
      }
    })
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return
    this.closeCalls++
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  send() {}

  static reset() {
    FakeWebSocket.instances = []
  }
}

/* ── Reconnect-timer capture ───────────────────────────────────────────────
   The hook schedules reconnects with setTimeout(..., 3000). Intercepting that
   one delay lets the test run any retry that was armed without waiting. */
let armedTimers: Array<{ id: number; run: () => void }> = []
let nextTimerId = 1
const realSetTimeout = globalThis.setTimeout
const realClearTimeout = globalThis.clearTimeout

beforeEach(() => {
  FakeWebSocket.reset()
  armedTimers = []
  nextTimerId = 1
  Object.defineProperty(globalThis, "WebSocket", {
    value: FakeWebSocket,
    configurable: true,
    writable: true,
  })
  globalThis.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) => {
    if (ms === 3000) {
      const id = nextTimerId++
      armedTimers.push({ id, run: () => fn(...(args as [])) })
      return id as unknown as ReturnType<typeof setTimeout>
    }
    return realSetTimeout(fn, ms, ...(args as []))
  }) as typeof setTimeout
  globalThis.clearTimeout = ((id?: number) => {
    if (typeof id === "number" && armedTimers.some((t) => t.id === id)) {
      armedTimers = armedTimers.filter((t) => t.id !== id)
      return
    }
    realClearTimeout(id as Parameters<typeof realClearTimeout>[0])
  }) as typeof clearTimeout
  localStorage.clear()
})

afterEach(() => {
  globalThis.setTimeout = realSetTimeout
  globalThis.clearTimeout = realClearTimeout
  document.body.innerHTML = ""
})

/* A consumer with a stable session: re-renders must not touch the socket. */
function Harness({ session, tick }: { session: string; tick: number }) {
  useWebSocket({
    session,
    events: "message,message.any",
    onMessage: () => {},
  })
  return <div data-tick={tick} />
}

async function mount(element: ReactElement): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  let root!: Root
  await act(async () => {
    root = createRoot(container)
    root.render(element)
  })
  return { root, container }
}

describe("useWebSocket", () => {
  test("keeps one socket across re-renders and does not reconnect after unmount", async () => {
    const { root } = await mount(<Harness session="alpha" tick={0} />)
    expect(FakeWebSocket.instances.length).toBe(1)

    for (let tick = 1; tick <= 4; tick++) {
      await act(async () => {
        root.render(<Harness session="alpha" tick={tick} />)
      })
    }

    expect(FakeWebSocket.instances.length).toBe(1)
    expect(FakeWebSocket.instances[0].url).toContain("session=alpha")

    await act(async () => {
      root.unmount()
    })

    expect(FakeWebSocket.instances[0].closeCalls).toBe(1)
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED)

    // A reconnect armed by the cleanup close (or after unmount) would open a
    // socket no component owns; run every armed timer and count again.
    for (const timer of [...armedTimers]) timer.run()
    expect(FakeWebSocket.instances.length).toBe(1)
  })

  test("closes the previous socket and opens one for the new session", async () => {
    const { root } = await mount(<Harness session="alpha" tick={0} />)
    await act(async () => {
      root.render(<Harness session="beta" tick={1} />)
    })

    expect(FakeWebSocket.instances.length).toBe(2)
    expect(FakeWebSocket.instances[0].closeCalls).toBe(1)
    expect(FakeWebSocket.instances[1].url).toContain("session=beta")

    // The closed alpha socket must not arm a retry that revives the old session.
    for (const timer of [...armedTimers]) timer.run()
    expect(FakeWebSocket.instances.length).toBe(2)

    await act(async () => {
      root.unmount()
    })
    expect(FakeWebSocket.instances[1].closeCalls).toBe(1)
  })
})

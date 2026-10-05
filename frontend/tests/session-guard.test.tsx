import "./setup-dom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useSessionGuard } from "../src/lib/use-session-guard"

/**
 * The chat page loads chats, messages and contacts per session. Switching
 * sessions fires a fresh load while the previous one may still be in flight,
 * and before this guard the slower answer won: with two sessions running, the
 * previous session's chats (and its contact names) appeared under the newly
 * selected session. These tests pin the guard that drops an answer belonging
 * to a session the user has left.
 *
 * The harness mirrors the page: a loader captures the session it was issued
 * for, awaits, then writes only when that session is still selected.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

/** A deferred promise, so a response can be resolved after a session switch. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

interface HarnessHandle {
  selectSession: (session: string) => void
  load: (session: string, response: Promise<string[]>) => void
}

/**
 * Renders the page's load pattern: rows state, a selected session, and a
 * loader that applies the guard exactly as chat-page.tsx does.
 */
function renderHarness(): HarnessHandle {
  let handle: HarnessHandle | null = null

  function Harness() {
    const [selectedSession, setSelectedSession] = useState("alpha")
    const [rows, setRows] = useState<string[]>([])
    const isCurrentSession = useSessionGuard(selectedSession)

    const load = (session: string, response: Promise<string[]>) => {
      void response.then((value) => {
        if (!isCurrentSession(session)) return
        setRows(value)
      })
    }

    handle = { selectSession: setSelectedSession, load }
    return <div data-rows={rows.join(",")} />
  }

  act(() => root.render(<Harness />))
  return handle!
}

function rows(): string {
  return container.querySelector("div")?.getAttribute("data-rows") ?? ""
}

describe("useSessionGuard", () => {
  test("applies an answer for the session that is still selected", async () => {
    const harness = renderHarness()
    const response = deferred<string[]>()

    act(() => harness.load("alpha", response.promise))
    await act(async () => {
      response.resolve(["alpha-chat"])
    })

    expect(rows()).toBe("alpha-chat")
  })

  test("drops an answer that arrives after the session changed", async () => {
    const harness = renderHarness()
    const slowAlpha = deferred<string[]>()

    act(() => harness.load("alpha", slowAlpha.promise))
    // The user switches before alpha answers, and beta loads and answers first.
    act(() => harness.selectSession("beta"))
    const beta = deferred<string[]>()
    act(() => harness.load("beta", beta.promise))
    await act(async () => {
      beta.resolve(["beta-chat"])
    })
    expect(rows()).toBe("beta-chat")

    // Now the stale alpha answer lands. It must not replace beta's rows, which
    // is the mixing the report describes.
    await act(async () => {
      slowAlpha.resolve(["alpha-chat"])
    })
    expect(rows()).toBe("beta-chat")
  })

  test("drops a stale answer even when it lands last for the same chat id", async () => {
    const harness = renderHarness()
    const first = deferred<string[]>()

    act(() => harness.load("alpha", first.promise))
    act(() => harness.selectSession("beta"))
    await act(async () => {
      first.resolve(["from-alpha"])
    })

    expect(rows()).toBe("")
  })

  test("accepts a fresh answer after switching back to the original session", async () => {
    const harness = renderHarness()

    act(() => harness.selectSession("beta"))
    const back = deferred<string[]>()
    act(() => harness.load("alpha", back.promise))
    // still on beta, so an alpha answer is stale
    await act(async () => {
      back.resolve(["alpha-chat"])
    })
    expect(rows()).toBe("")

    act(() => harness.selectSession("alpha"))
    const current = deferred<string[]>()
    act(() => harness.load("alpha", current.promise))
    await act(async () => {
      current.resolve(["alpha-fresh"])
    })
    expect(rows()).toBe("alpha-fresh")
  })
})

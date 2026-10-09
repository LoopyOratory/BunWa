import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api, fetchImageBlobUrl } from "@/lib/api"

const CONCURRENCY = 4
/** A chat without a picture is checked again after this long. */
const NO_PICTURE_TTL_MS = 60 * 60_000
const RETRY_BASE_MS = 2 * 60_000
const RETRY_MAX_MS = 30 * 60_000

type Entry =
  | { kind: "url"; url: string }
  | { kind: "none"; at: number }
  | { kind: "failed"; at: number; attempts: number }

/**
 * Profile pictures for one session's chat list.
 *
 * The old loader restarted on every list refresh, fetched one picture at a
 * time, never remembered that a chat has no picture (so it asked again every
 * 5 seconds, forever) and never released the blob URLs it created. This cache:
 *
 * - is asked only for the rows on screen (`request(ids)`),
 * - runs at most four lookups at a time,
 * - remembers "no picture" for an hour and backs off on failures,
 * - revokes every blob URL when the session changes or the list unmounts.
 */
export function useAvatars(session: string) {
  const cacheRef = useRef<Map<string, Entry>>(new Map())
  const queueRef = useRef<string[]>([])
  const inFlightRef = useRef<Set<string>>(new Set())
  const sessionRef = useRef(session)
  const [version, setVersion] = useState(0)

  const revokeAll = useCallback(() => {
    for (const entry of cacheRef.current.values()) {
      if (entry.kind === "url" && entry.url.startsWith("blob:")) URL.revokeObjectURL(entry.url)
    }
  }, [])

  // Session switch: forget everything (and free the old blob URLs).
  useEffect(() => {
    sessionRef.current = session
    return () => {
      revokeAll()
      cacheRef.current = new Map()
      queueRef.current = []
      inFlightRef.current = new Set()
    }
  }, [session, revokeAll])

  const isFresh = (entry: Entry | undefined, now: number): boolean => {
    if (!entry) return false
    if (entry.kind === "url") return true
    if (entry.kind === "none") return now - entry.at < NO_PICTURE_TTL_MS
    const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (entry.attempts - 1))
    return now - entry.at < wait
  }

  const pumpRef = useRef<() => void>(() => {})
  const pump = useCallback(() => {
    while (inFlightRef.current.size < CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift()!
      if (inFlightRef.current.has(id)) continue
      const owner = sessionRef.current
      inFlightRef.current.add(id)
      void (async () => {
        let entry: Entry
        try {
          const res = await api.getContactPicture(owner, id)
          const blob = res.profilePictureURL ? await fetchImageBlobUrl(res.profilePictureURL) : null
          entry = blob ? { kind: "url", url: blob } : { kind: "none", at: Date.now() }
        } catch {
          const previous = cacheRef.current.get(id)
          const attempts = previous?.kind === "failed" ? previous.attempts + 1 : 1
          entry = { kind: "failed", at: Date.now(), attempts }
        }
        if (sessionRef.current !== owner) {
          // The session changed while this was in flight; drop it.
          if (entry.kind === "url") URL.revokeObjectURL(entry.url)
          return
        }
        inFlightRef.current.delete(id)
        cacheRef.current.set(id, entry)
        setVersion((v) => v + 1)
        pumpRef.current()
      })()
    }
  }, [])

  useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  /** Ask for the pictures of these chats (normally the rows on screen). */
  const request = useCallback(
    (ids: string[]) => {
      if (!sessionRef.current) return
      const now = Date.now()
      let added = false
      for (const id of ids) {
        if (inFlightRef.current.has(id) || queueRef.current.includes(id)) continue
        if (isFresh(cacheRef.current.get(id), now)) continue
        queueRef.current.push(id)
        added = true
      }
      if (added) pump()
    },
    [pump],
  )

  /** Seed a picture the caller already knows (contact store, overview row). */
  const seed = useCallback((id: string, url: string | undefined | null) => {
    if (!url || cacheRef.current.get(id)?.kind === "url") return
    cacheRef.current.set(id, { kind: "url", url })
  }, [])

  const get = useCallback(
    (id: string): string | undefined => {
      const entry = cacheRef.current.get(id)
      return entry?.kind === "url" ? entry.url : undefined
    },
    // `version` makes consumers re-read after a picture lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )

  return useMemo(() => ({ get, request, seed }), [get, request, seed])
}

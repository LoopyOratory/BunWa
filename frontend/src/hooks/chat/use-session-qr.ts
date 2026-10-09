import { useEffect, useState } from "react"
import QRCodeLib from "qrcode"
import { api } from "@/lib/api"

const REFRESH_MS = 5_000

/**
 * The pairing QR code for a session waiting to be scanned, refreshed every
 * 5 s while `active` (WhatsApp rotates the code).
 */
export function useSessionQr(session: string, active: boolean) {
  const [qr, setQr] = useState<string | null>(null)
  const [loading, setLoading] = useState(active && !!session)
  const [error, setError] = useState(false)

  const key = `${session}|${active}`
  const [stateKey, setStateKey] = useState(key)
  if (stateKey !== key) {
    setStateKey(key)
    setQr(null)
    setError(false)
    setLoading(active && !!session)
  }

  useEffect(() => {
    if (!active || !session) return
    let cancelled = false
    const fetchQr = async () => {
      try {
        const res = await api.getQRCode(session)
        if (res.qr?.raw && !cancelled) {
          const url = await QRCodeLib.toDataURL(res.qr.raw, { width: 256, margin: 1 })
          if (!cancelled) {
            setQr(url)
            setError(false)
          }
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchQr()
    const interval = setInterval(() => void fetchQr(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session, active])

  return { qr, loading, error }
}

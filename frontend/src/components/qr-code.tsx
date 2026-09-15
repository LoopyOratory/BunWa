import { useEffect, useState } from "react"
import QRCodeLib from "qrcode"
import { QrCode } from "lucide-react"
import { EmptyState, ErrorState, Skeleton } from "@/components/primitives"

interface QRCodeProps {
  data: string
  size?: number
  /** Optional session name, used to make the image alt text descriptive. */
  sessionName?: string
}

/** Generated code, tagged with the data string it belongs to (avoids stale renders). */
interface GeneratedCode {
  data: string
  src: string
}

export function QRCodeDisplay({ data, size = 256, sessionName }: QRCodeProps) {
  const [generated, setGenerated] = useState<GeneratedCode | null>(null)
  const [failedData, setFailedData] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const alt = sessionName
    ? `WhatsApp pairing QR code for session ${sessionName}`
    : "WhatsApp pairing QR code"

  const isDataUrl = data.startsWith("data:image")

  useEffect(() => {
    if (!data || isDataUrl) return
    let cancelled = false

    QRCodeLib.toDataURL(data, {
      width: size,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    }).then((url) => {
      if (!cancelled) setGenerated({ data, src: url })
    }).catch((err) => {
      console.error("QR render error:", err)
      if (!cancelled) setFailedData(data)
    })

    return () => {
      cancelled = true
    }
  }, [data, size, isDataUrl, attempt])

  if (!data) {
    return (
      <EmptyState
        compact
        icon={<QrCode strokeWidth={1.75} />}
        title="No QR data"
        description="The session has not returned a QR code yet."
      />
    )
  }

  if (failedData === data) {
    return (
      <ErrorState
        compact
        title="Could not render the QR code"
        description="The QR data could not be encoded. Retry, or request a new code from the session."
        onRetry={() => {
          setFailedData(null)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  const src = isDataUrl ? data : generated && generated.data === data ? generated.src : null

  if (!src) {
    return (
      <div role="status" aria-label="Generating QR code" style={{ width: size, height: size }}>
        <Skeleton className="size-full rounded-lg" />
      </div>
    )
  }

  return (
    // White plate on purpose: scanners need light modules to stay light, and the
    // app defaults to a dark theme, so the code must not inherit a dark surface.
    <div className="inline-flex rounded-lg border border-border bg-white p-3">
      <img
        src={src}
        alt={alt}
        className="block bg-white"
        width={size}
        height={size}
      />
    </div>
  )
}

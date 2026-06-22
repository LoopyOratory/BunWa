import { useEffect, useState } from "react"

interface QRCodeProps {
  data: string
  size?: number
}

export function QRCodeDisplay({ data, size = 256 }: QRCodeProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!data) {
      setSrc(null)
      setError(false)
      return
    }

    if (data.startsWith("data:image")) {
      setSrc(data)
      setError(false)
      return
    }

    import("qrcode").then((QRCode) => {
      return QRCode.toDataURL(data, {
        width: size,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
    }).then((url) => {
      setSrc(url)
      setError(false)
    }).catch((err) => {
      console.error("QR render error:", err)
      setError(true)
    })
  }, [data, size])

  if (!data) {
    return (
      <div className="flex size-64 items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-xs text-muted-foreground">No QR data</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex size-64 items-center justify-center rounded-lg border bg-destructive/10">
        <p className="text-xs text-destructive">Failed to render QR code</p>
      </div>
    )
  }

  if (!src) {
    return (
      <div className="flex size-64 items-center justify-center rounded-lg border bg-muted/30">
        <p className="text-xs text-muted-foreground">Generating QR...</p>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt="QR Code"
      className="rounded-lg"
      width={size}
      height={size}
    />
  )
}

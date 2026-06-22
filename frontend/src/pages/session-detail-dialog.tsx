import { useEffect, useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { api, type Session } from "@/lib/api"
import { Smartphone, QrCode, Loader2 } from "lucide-react"
import { QRCodeDisplay } from "@/components/qr-code"
import { toast } from "sonner"

interface Props {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SessionDetailDialog({ session, open, onOpenChange }: Props) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const [loadingQr, setLoadingQr] = useState(false)

  useEffect(() => {
    if (!open || !session) return
    setScreenshot(null)
    setQrCode(null)
  }, [open, session])

  if (!session) return null

  const handleScreenshot = async () => {
    if (session.status !== "WORKING") {
      toast.error("Session must be WORKING to take a screenshot")
      return
    }
    setLoadingScreenshot(true)
    try {
      const data = await api.getScreenshot(session.name)
      if (data?.screenshot) {
        const raw = data.screenshot
        setScreenshot(raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`)
      } else {
        toast.error("Screenshot not available")
      }
    } catch {
      toast.error("Failed to load screenshot")
    } finally {
      setLoadingScreenshot(false)
    }
  }

  const fetchQr = useCallback(async (sessionName: string) => {
    try {
      const data = await api.getQRCode(sessionName)
      if (data.qr?.raw) {
        setQrCode(data.qr.raw)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!open || !session || session.status !== "SCAN_QR_CODE" || !qrCode) return
    const interval = setInterval(() => fetchQr(session.name), 5000)
    return () => clearInterval(interval)
  }, [open, session, qrCode, fetchQr])

  const handleQrCode = async () => {
    if (session.status === "STOPPED") {
      toast.error("Start the session first to get the QR code")
      return
    }
    if (session.status !== "SCAN_QR_CODE") {
      toast.error(`Session must be in SCAN_QR_CODE status, current: ${session.status}`)
      return
    }
    setLoadingQr(true)
    try {
      const data = await api.getQRCode(session.name)
      setQrCode(data.qr?.raw || null)
    } catch {
      toast.error("Failed to load QR code")
    } finally {
      setLoadingQr(false)
    }
  }

  const statusVariant =
    session.status === "WORKING" ? "default" as const
      : session.status === "SCAN_QR_CODE" ? "secondary" as const
      : session.status === "FAILED" ? "destructive" as const
      : "outline" as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">{session.name[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            {session.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant={statusVariant}>{session.status}</Badge>
          </div>
          <Separator />
          {session.me && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Push Name</span>
                <span className="text-xs font-medium">{session.me.pushName || "-"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Phone Number</span>
                <span className="text-xs font-medium">{session.me.id || "-"}</span>
              </div>
              <Separator />
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Engine</span>
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{session.config?.engine || "N/A"}</code>
          </div>
          {session.timestamps?.activity && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Last Activity</span>
              <span className="text-xs">
                {new Date(session.timestamps.activity * 1000).toLocaleString()}
              </span>
            </div>
          )}

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleScreenshot} disabled={loadingScreenshot}>
              {loadingScreenshot ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Smartphone className="mr-1 size-3" />}
              Screenshot
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={handleQrCode} disabled={loadingQr}>
              {loadingQr ? <Loader2 className="mr-1 size-3 animate-spin" /> : <QrCode className="mr-1 size-3" />}
              QR Code
            </Button>
          </div>

          {screenshot && (
            <div className="rounded-lg border">
              <img src={screenshot} alt="Session screenshot" className="w-full rounded-lg" />
            </div>
          )}

          {qrCode && (
            <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Scan this QR code with WhatsApp</p>
              <QRCodeDisplay data={qrCode} size={192} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

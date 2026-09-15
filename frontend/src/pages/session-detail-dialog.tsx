import { useEffect, useState, useCallback, type ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { EngineBadge, Metric, Skeleton, StatusBadge } from "@/components/primitives"
import { api, type Session } from "@/lib/api"
import { Smartphone, QrCode, Loader2, Copy, Phone } from "lucide-react"
import { QRCodeDisplay } from "@/components/qr-code"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"

interface Props {
  session: Session | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  )
}

export function SessionDetailDialog({ session, open, onOpenChange }: Props) {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrError, setQrError] = useState<string | null>(null)
  const [loadingScreenshot, setLoadingScreenshot] = useState(false)
  const [loadingQr, setLoadingQr] = useState(false)
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)

  useEffect(() => {
    if (!open || !session) return
    setScreenshot(null)
    setQrCode(null)
    setQrError(null)
    setPairingCode(null)
    setPairingError(null)
  }, [open, session])

  const fetchQr = useCallback(async (sessionName: string) => {
    try {
      const data = await api.getQRCode(sessionName)
      if (data.qr?.raw) {
        setQrCode(data.qr.raw)
        setQrError(null)
      }
    } catch {
      setQrError("Could not refresh the QR code. Retrying automatically.")
    }
  }, [])

  useEffect(() => {
    if (!open || !session || session.status !== "SCAN_QR_CODE" || !qrCode) return
    const interval = setInterval(() => fetchQr(session.name), 5000)
    return () => clearInterval(interval)
  }, [open, session, qrCode, fetchQr])

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
    setQrError(null)
    try {
      const data = await api.getQRCode(session.name)
      setQrCode(data.qr?.raw || null)
    } catch {
      setQrError("Could not load the QR code.")
      toast.error("Failed to load QR code")
    } finally {
      setLoadingQr(false)
    }
  }

  const handlePairingCode = async () => {
    if (!pairingPhone.trim() || !session) return
    // Strip all non-digit characters for Baileys (no +, no spaces, no dashes)
    const cleanPhone = pairingPhone.trim().replace(/\D/g, "")
    if (!cleanPhone) {
      toast.error("Enter a valid phone number")
      return
    }
    setPairingLoading(true)
    setPairingError(null)
    try {
      const res = await api.requestPairingCode(session.name, cleanPhone)
      if (res.code) {
        setPairingCode(res.code)
        toast.success("Pairing code received")
      } else {
        setPairingCode(null)
        setPairingError("The server did not return a pairing code. Try again.")
      }
    } catch {
      setPairingCode(null)
      setPairingError("Could not get a pairing code. Check the phone number and try again.")
      toast.error("Failed to get pairing code")
    } finally {
      setPairingLoading(false)
    }
  }

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
        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <DetailRow label="Status">
            <StatusBadge status={session.status} />
          </DetailRow>
          <Separator />
          {session.me && (
            <>
              <DetailRow label="Push name">
                <span className="text-sm">{session.me.pushName || "-"}</span>
              </DetailRow>
              <DetailRow label="Phone number">
                <Metric className="font-mono text-xs">{session.me.id || "-"}</Metric>
              </DetailRow>
              <Separator />
            </>
          )}
          <DetailRow label="Engine">
            <EngineBadge engine={session.config?.engine} />
          </DetailRow>
          {session.timestamps?.activity && (
            <DetailRow label="Last activity">
              <span className="text-xs text-muted-foreground">
                {new Date(session.timestamps.activity * 1000).toLocaleString()}
              </span>
            </DetailRow>
          )}

          <Separator />

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 rounded-md"
              onClick={handleScreenshot}
              disabled={loadingScreenshot || session.status !== "WORKING" || session.config?.engine !== "WEBJS"}>
              {loadingScreenshot ? <Loader2 className="mr-1 size-3 animate-spin" strokeWidth={1.75} /> : <Smartphone className="mr-1 size-3" strokeWidth={1.75} />}
              Screenshot
            </Button>
            <Button variant="outline" size="sm" className="flex-1 rounded-md"
              onClick={handleQrCode}
              disabled={loadingQr || session.status === "STOPPED"}>
              {loadingQr ? <Loader2 className="mr-1 size-3 animate-spin" strokeWidth={1.75} /> : <QrCode className="mr-1 size-3" strokeWidth={1.75} />}
              QR code
            </Button>
          </div>

          {/* Pairing Code */}
          {session.status === "SCAN_QR_CODE" && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" strokeWidth={1.75} />
                <span className="text-sm font-medium">Phone pairing</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="+233 50 123 4567"
                  value={pairingPhone}
                  onChange={(e) => setPairingPhone(e.target.value)}
                  className="min-h-[44px] flex-1"
                  onKeyDown={(e) => e.key === "Enter" && !pairingLoading && handlePairingCode()}
                />
                <Button onClick={handlePairingCode} disabled={pairingLoading || !pairingPhone.trim()} className="min-h-[44px] rounded-md">
                  {pairingLoading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.75} /> : "Get code"}
                </Button>
              </div>
              {pairingError && (
                <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
                  {pairingError}
                </p>
              )}
              {pairingCode && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  <Metric className="flex-1 font-mono text-sm font-bold">{pairingCode}</Metric>
                  <Button variant="ghost" size="icon-sm" aria-label="Copy pairing code" onClick={() => navigator.clipboard.writeText(pairingCode || "")}>
                    <Copy className="size-4" strokeWidth={1.75} />
                  </Button>
                </div>
              )}
            </div>
          )}

          {loadingScreenshot && !screenshot && (
            <Skeleton className="h-48 w-full" />
          )}

          {screenshot && (
            <div className="rounded-lg border">
              <img src={screenshot} alt="Session screenshot" className="w-full rounded-lg" />
            </div>
          )}

          {loadingQr && !qrCode && (
            <Skeleton className="mx-auto size-48 rounded-lg" />
          )}

          {qrCode && (
            <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Scan this QR code with WhatsApp</p>
              <QRCodeDisplay data={qrCode} size={192} />
            </div>
          )}

          {qrError && (
            <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
              {qrError}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

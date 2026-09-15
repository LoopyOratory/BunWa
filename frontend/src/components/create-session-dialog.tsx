import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { QRCodeDisplay } from "@/components/qr-code"
import { Skeleton } from "@/components/primitives"
import { api } from "@/lib/api"
import { toast } from "sonner"
import {
  Smartphone,
  Globe,
  Loader2,
  CheckCircle2,
  QrCode,
  Copy,
} from "lucide-react"

const ENGINES = [
  {
    id: "noweb",
    name: "NOWEB",
    subtitle: "Baileys (lightweight)",
    icon: Smartphone,
    description: "No browser required. Best for channels, newsletters, multi-session setups. Uses Baileys WhatsApp protocol implementation.",
  },
  {
    id: "webjs",
    name: "WEBJS",
    subtitle: "Chrome via Puppeteer",
    icon: Globe,
    description: "More stable message delivery. Uses real WhatsApp Web via Chrome. Requires ~300MB RAM per session.",
  },
]

type Step = "create" | "auth" | "ready"

interface CreateSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

export function CreateSessionDialog({ open, onOpenChange, onCreated }: CreateSessionDialogProps) {
  const [step, setStep] = useState<Step>("create")
  const [sessionName, setSessionName] = useState("")
  const [engine, setEngine] = useState("noweb")
  const [autoStart, setAutoStart] = useState(false)
  const [loading, setLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [createdSessionName, setCreatedSessionName] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStep("create")
      setSessionName("")
      setEngine("noweb")
      setLoading(false)
      setCreateError(null)
      setStatus(null)
      setQrCode(null)
      setPairingPhone("")
      setPairingCode(null)
      setPairingError(null)
      setCreatedSessionName(null)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open])

  const fetchQr = useCallback(async (name: string) => {
    try {
      const res = await api.getQRCode(name)
      if (res.qr?.raw) setQrCode(res.qr.raw)
    } catch { /* QR may not be ready */ }
  }, [])

  const pollStatus = useCallback(async (name: string) => {
    try {
      const session = await api.getSession(name)
      setStatus(session.status)
      if (session.status === "WORKING") {
        setStep("ready")
        if (pollRef.current) clearInterval(pollRef.current)
      } else if (session.status === "SCAN_QR_CODE") {
        setStep("auth")
        fetchQr(name)
      }
    } catch { /* ignore */ }
  }, [fetchQr])

  useEffect(() => {
    if (!open || !createdSessionName) return
    // Start polling after a short delay to let the session initialize
    const initTimer = setTimeout(() => {
      pollStatus(createdSessionName)
      pollRef.current = setInterval(() => pollStatus(createdSessionName), 3000)
    }, 2000)
    return () => {
      clearTimeout(initTimer)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open, createdSessionName, pollStatus])

  const handleCreate = async () => {
    if (!sessionName.trim()) return
    setLoading(true)
    setCreateError(null)
    try {
      const config: Record<string, any> = engine === "webjs" ? { engine: "webjs" } : {}
      if (autoStart) config.autoStart = true
      await api.createSessionWithConfig(sessionName.trim(), config)
      await api.startSession(sessionName.trim())
      setCreatedSessionName(sessionName.trim())
      setStatus("STARTING")
      toast.success("Session created, starting now")
    } catch (e: any) {
      const message = e.message || "Failed to create session"
      setCreateError(message)
      toast.error(message)
      setLoading(false)
    }
  }

  const handlePairing = async () => {
    if (!pairingPhone.trim() || !createdSessionName) return
    setPairingLoading(true)
    setPairingError(null)
    try {
      const res = await api.requestPairingCode(createdSessionName, pairingPhone.trim())
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

  const handleCopyPairing = () => {
    if (pairingCode) navigator.clipboard.writeText(pairingCode)
  }

  const handleDone = () => {
    onCreated()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "create" && "Create session"}
            {step === "auth" && "Authenticate: " + createdSessionName}
            {step === "ready" && "Session ready"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Name + Engine */}
        {step === "create" && (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto py-2">
            <div className="space-y-2">
              <Label>Session name</Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. support-line"
                className="min-h-[44px]"
                onKeyDown={(e) => e.key === "Enter" && !loading && handleCreate()}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-sm font-medium">Engine</p>
              <div className="grid grid-cols-2 gap-3">
                {ENGINES.map((e) => {
                  const selected = engine === e.id
                  return (
                    <button
                      key={e.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setEngine(e.id)}
                      className={`rounded-lg border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-3">
                        <div className={`rounded-md p-2 ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                          <e.icon className="size-5" strokeWidth={1.75} />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">{e.name}</h4>
                          <p className="text-[11px] text-muted-foreground">{e.subtitle}</p>
                        </div>
                      </div>
                      {selected && <Badge variant="secondary" className="text-[10px]">Selected</Badge>}
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{e.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>Start automatically</Label>
                <p className="text-xs text-muted-foreground">Start this session when the server restarts.</p>
              </div>
              <Switch checked={autoStart} onCheckedChange={setAutoStart} />
            </div>

            {createError && (
              <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-sm text-error-foreground">
                {createError}
              </p>
            )}

            <Button onClick={handleCreate} disabled={loading || !sessionName.trim()} className="h-11 w-full rounded-md text-base">
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" strokeWidth={1.75} /> : null}
              {loading ? "Creating" : "Create and start"}
            </Button>
          </div>
        )}

        {/* STEP 2: Authenticate (QR + Pairing) */}
        {step === "auth" && (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto py-2">
            {/* Status */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              {status ? (
                <span>Status: {status.toLowerCase().replace(/_/g, " ")}</span>
              ) : (
                <>
                  <Skeleton className="size-4 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </>
              )}
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              {qrCode ? (
                <>
                  <QRCodeDisplay data={qrCode} size={220} />
                  <ol className="mx-auto w-fit list-inside list-decimal space-y-0.5 text-left text-xs text-muted-foreground">
                    <li>Open WhatsApp</li>
                    <li>Go to Settings, then Linked devices</li>
                    <li>Tap Link a device</li>
                  </ol>
                </>
              ) : (
                <div className="flex size-[220px] items-center justify-center rounded-lg border bg-muted/30">
                  <QrCode className="size-10 text-muted-foreground/50" strokeWidth={1.75} />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Phone Pairing */}
            <div className="space-y-3">
              <Label>Pair with a phone number</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="+233 50 123 4567"
                  value={pairingPhone}
                  onChange={(e) => setPairingPhone(e.target.value)}
                  className="min-h-[44px] flex-1"
                  onKeyDown={(e) => e.key === "Enter" && !pairingLoading && handlePairing()}
                />
                <Button onClick={handlePairing} disabled={pairingLoading || !pairingPhone.trim()} className="min-h-[44px] rounded-md">
                  {pairingLoading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.75} /> : "Get code"}
                </Button>
              </div>
              {pairingError && (
                <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-sm text-error-foreground">
                  {pairingError}
                </p>
              )}
              {pairingCode && (
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <code className="metric flex-1 font-mono text-sm font-bold">{pairingCode}</code>
                  <Button variant="ghost" size="icon-sm" onClick={handleCopyPairing} aria-label="Copy pairing code">
                    <Copy className="size-4" strokeWidth={1.75} />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Enter your phone number to receive a pairing code instead of scanning the QR code.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: Ready */}
        {step === "ready" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex size-16 items-center justify-center rounded-full border border-success-border bg-success-bg">
              <CheckCircle2 className="size-8 text-success-foreground" strokeWidth={1.75} />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">Session ready</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {createdSessionName} is connected and working.
              </p>
            </div>
            <Button onClick={handleDone} className="mt-2 rounded-md">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

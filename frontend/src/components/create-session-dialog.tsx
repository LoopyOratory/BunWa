import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { QRCodeDisplay } from "@/components/qr-code"
import { api } from "@/lib/api"
import { toast } from "sonner"
import {
  Smartphone,
  Globe,
  Loader2,
  CheckCircle2,
  RefreshCw,
  QrCode,
  Copy,
} from "lucide-react"

const ENGINES = [
  {
    id: "noweb",
    name: "NOWEB",
    subtitle: "Baileys — Lightweight",
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
  const [status, setStatus] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairingPhone, setPairingPhone] = useState("")
  const [pairingCode, setPairingCode] = useState<string | null>(null)
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
      setStatus(null)
      setQrCode(null)
      setPairingPhone("")
      setPairingCode(null)
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
    try {
      const config: Record<string, any> = engine === "webjs" ? { engine: "webjs" } : {}
      if (autoStart) config.autoStart = true
      await api.createSessionWithConfig(sessionName.trim(), config)
      await api.startSession(sessionName.trim())
      setCreatedSessionName(sessionName.trim())
      setStatus("STARTING")
      toast.success("Session created and starting...")
    } catch (e: any) {
      toast.error(e.message || "Failed to create session")
      setLoading(false)
    }
  }

  const handlePairing = async () => {
    if (!pairingPhone.trim() || !createdSessionName) return
    setPairingLoading(true)
    try {
      const res = await api.requestPairingCode(createdSessionName, pairingPhone.trim())
      setPairingCode(res.code || "Code sent")
      toast.success("Pairing code received")
    } catch {
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
            {step === "create" && "Create New Session"}
            {step === "auth" && "Authenticate — " + createdSessionName}
            {step === "ready" && "Session Ready"}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Name + Engine */}
        {step === "create" && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Session Name</Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g., my-session"
                className="min-h-[44px]"
                onKeyDown={(e) => e.key === "Enter" && !loading && handleCreate()}
              />
            </div>

            <div className="space-y-3">
              <Label>Engine</Label>
              <div className="grid grid-cols-2 gap-3">
                {ENGINES.map((e) => (
                  <div
                    key={e.id}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                      engine === e.id
                        ? "border-emerald-500 bg-emerald-500/5"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                    onClick={() => setEngine(e.id)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${engine === e.id ? "bg-emerald-500/15" : "bg-muted"}`}>
                        <e.icon className={`size-5 ${engine === e.id ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{e.name}</h4>
                        <p className="text-[11px] text-muted-foreground">{e.subtitle}</p>
                      </div>
                    </div>
                    {engine === e.id && <Badge variant="secondary" className="text-[10px]">Selected</Badge>}
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{e.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label>Auto-start on boot</Label>
                <p className="text-[11px] text-muted-foreground">Automatically start this session when the server restarts</p>
              </div>
              <Switch checked={autoStart} onCheckedChange={setAutoStart} />
            </div>

            <Button onClick={handleCreate} disabled={loading || !sessionName.trim()} className="w-full h-11 text-base">
              {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              {loading ? "Creating..." : "Create & Start"}
            </Button>
          </div>
        )}

        {/* STEP 2: Authenticate (QR + Pairing) */}
        {step === "auth" && (
          <div className="space-y-5 py-2">
            {/* Status */}
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" />
              Status: {status || "Connecting..."}
            </div>

            {/* QR Code */}
            <div className="flex flex-col items-center gap-3">
              {qrCode ? (
                <>
                  <QRCodeDisplay data={qrCode} size={220} />
                  <p className="text-xs text-muted-foreground text-center">
                    Open WhatsApp → Settings → Linked Devices → Link a Device
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-center size-[220px] rounded-xl border bg-muted/30">
                  <QrCode className="size-10 text-muted-foreground/50" />
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Phone Pairing */}
            <div className="space-y-3">
              <Label>Pair with Phone Number</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="+233501234567"
                  value={pairingPhone}
                  onChange={(e) => setPairingPhone(e.target.value)}
                  className="min-h-[44px] flex-1"
                  onKeyDown={(e) => e.key === "Enter" && !pairingLoading && handlePairing()}
                />
                <Button onClick={handlePairing} disabled={pairingLoading || !pairingPhone.trim()} className="min-h-[44px]">
                  {pairingLoading ? <Loader2 className="size-4 animate-spin" /> : "Get Code"}
                </Button>
              </div>
              {pairingCode && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted">
                  <code className="text-sm font-mono font-bold flex-1">{pairingCode}</code>
                  <Button variant="ghost" size="icon-sm" onClick={handleCopyPairing}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Enter your phone number to receive a pairing code instead of scanning QR
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: Ready */}
        {step === "ready" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="size-8 text-emerald-500" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">Session Ready</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {createdSessionName} is now connected and working
              </p>
            </div>
            <Button onClick={handleDone} className="mt-2">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

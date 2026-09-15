import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import QRCodeLib from "qrcode"
import {
  Play,
  Square,
  ChevronDown,
  QrCode,
  CircleOff,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { EmptyState, Skeleton } from "@/components/primitives"
import { api, type Session } from "@/lib/api"

interface SessionSelectorProps {
  sessions: Session[]
  selectedSession: string
  onSessionChange: (name: string) => void
  onStartSession: (name: string) => void
  onStopSession: (name: string) => void
  disabled?: boolean
}

function getSessionStatusTone(status: string): { dot: string; chip: string } {
  switch (status) {
    case "WORKING":
      return {
        dot: "bg-success",
        chip: "border border-success-border bg-success-bg text-success-foreground",
      }
    case "STARTING":
    case "SCAN_QR_CODE":
      return {
        dot: "bg-warning",
        chip: "border border-warning-border bg-warning-bg text-warning-foreground",
      }
    case "FAILED":
      return {
        dot: "bg-error",
        chip: "border border-error-border bg-error-bg text-error-foreground",
      }
    default:
      return {
        dot: "bg-muted-foreground",
        chip: "border border-border bg-muted text-muted-foreground",
      }
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "WORKING": return "Connected"
    case "STARTING": return "Connecting"
    case "SCAN_QR_CODE": return "Scan QR"
    case "FAILED": return "Failed"
    case "STOPPED": return "Stopped"
    default: return status
  }
}

export function SessionSelector({
  sessions,
  selectedSession,
  onSessionChange,
  onStartSession,
  onStopSession,
  disabled,
}: SessionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loadingQR, setLoadingQR] = useState(false)
  const [qrError, setQrError] = useState(false)

  const current = sessions.find((s) => s.name === selectedSession)
  const isScanning = current?.status === "SCAN_QR_CODE"
  const currentTone = getSessionStatusTone(current?.status || "STOPPED")

  useEffect(() => {
    if (!open || !isScanning) { setQrCode(null); setQrError(false); return }
    let cancelled = false
    const fetchQR = async () => {
      setLoadingQR(true)
      try {
        const res = await api.getQRCode(selectedSession)
        if (res.qr?.raw && !cancelled) {
          const url = await QRCodeLib.toDataURL(res.qr.raw, { width: 256, margin: 1 })
          if (!cancelled) { setQrCode(url); setQrError(false) }
        }
      } catch {
        if (!cancelled) setQrError(true)
      }
      finally { if (!cancelled) setLoadingQR(false) }
    }
    fetchQR()
    const iv = setInterval(fetchQR, 5000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [open, isScanning, selectedSession])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className={`text-xs font-bold ${currentTone.chip}`}>
            {selectedSession[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--chat-text-primary)]">
            {current?.me?.pushName || selectedSession}
          </p>
          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${currentTone.dot}`} />
            <span className="text-[11px] text-[var(--chat-text-tertiary)]">{getStatusLabel(current?.status || "STOPPED")}</span>
            {current?.me?.id && (
              <span className="metric truncate text-[10px] text-[var(--chat-text-tertiary)] opacity-50">
                {current.me.id.split("@")[0]}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`size-4 text-[var(--chat-text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={1.75} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-[var(--chat-border-strong)] bg-popover py-1 text-popover-foreground shadow-lg"
          >
            {isScanning && (
              <div className="border-b border-[var(--chat-border)] p-3">
                <p className="mb-2 text-[11px] font-semibold text-[var(--chat-text-tertiary)]">
                  Scan QR code
                </p>
                <div className="flex justify-center">
                  {loadingQR ? (
                    <Skeleton className="size-32 rounded-lg" />
                  ) : qrCode ? (
                    <img
                      src={qrCode}
                      alt="QR code"
                      className="size-32 rounded-lg"
                    />
                  ) : (
                    <div className="flex size-32 items-center justify-center rounded-lg border-2 border-dashed border-[var(--chat-border)]">
                      <QrCode className="size-10 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} />
                    </div>
                  )}
                </div>
                <ol className="mx-auto mt-2 w-fit list-inside list-decimal space-y-0.5 text-left text-[10px] text-[var(--chat-text-tertiary)]">
                  <li>Open WhatsApp</li>
                  <li>Go to Settings, then Linked devices</li>
                  <li>Tap Link a device</li>
                </ol>
                {qrError && (
                  <p role="alert" className="mt-2 rounded-md border border-error-border bg-error-bg px-2 py-1 text-center text-[10px] text-error-foreground">
                    Could not load the QR code. Retrying automatically.
                  </p>
                )}
              </div>
            )}

            {sessions.length === 0 ? (
              <EmptyState
                compact
                icon={<CircleOff className="size-5" strokeWidth={1.75} />}
                title="No sessions"
                description="Create a session to get started."
              />
            ) : (
              <div className="max-h-[240px] overflow-y-auto">
                {sessions.map((s) => {
                  const active = s.name === selectedSession
                  const tone = getSessionStatusTone(s.status)
                  return (
                    <button
                      key={s.name}
                      onClick={() => { onSessionChange(s.name); setOpen(false) }}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                        active ? "bg-[var(--chat-accent-soft)]" : "hover:bg-[var(--chat-accent-soft)]"
                      }`}
                    >
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className={`text-xs font-bold ${tone.chip}`}>
                          {s.name[0]?.toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] ${active ? "font-bold" : "font-medium"} text-[var(--chat-text-primary)]`}>
                          {s.me?.pushName || s.name}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className={`size-1.5 rounded-full ${tone.dot}`} />
                          <span className="text-[10px] text-[var(--chat-text-tertiary)]">{getStatusLabel(s.status)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        {s.status !== "WORKING" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md text-success-foreground hover:bg-success-bg"
                            onClick={(e) => { e.stopPropagation(); onStartSession(s.name) }}
                            aria-label={`Start ${s.name}`}
                            title="Start"
                          >
                            <Play className="size-3.5" strokeWidth={1.75} />
                          </Button>
                        )}
                        {s.status === "WORKING" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-md text-error-foreground hover:bg-error-bg"
                            onClick={(e) => { e.stopPropagation(); onStopSession(s.name) }}
                            aria-label={`Stop ${s.name}`}
                            title="Stop"
                          >
                            <Square className="size-3.5" strokeWidth={1.75} />
                          </Button>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

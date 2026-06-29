import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import QRCodeLib from "qrcode"
import {
  Play,
  Square,
  RefreshCw,
  ChevronDown,
  QrCode,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { api, type Session } from "@/lib/api"

interface SessionSelectorProps {
  sessions: Session[]
  selectedSession: string
  onSessionChange: (name: string) => void
  onStartSession: (name: string) => void
  onStopSession: (name: string) => void
  disabled?: boolean
}

function getSessionStatusColor(status: string): string {
  switch (status) {
    case "WORKING": return "bg-emerald-500"
    case "STARTING": return "bg-amber-500"
    case "SCAN_QR_CODE": return "bg-blue-500"
    case "FAILED": return "bg-red-500"
    default: return "bg-zinc-400 dark:bg-zinc-600"
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

  const current = sessions.find((s) => s.name === selectedSession)
  const isScanning = current?.status === "SCAN_QR_CODE"

  useEffect(() => {
    if (!open || !isScanning) { setQrCode(null); return }
    let cancelled = false
    const fetchQR = async () => {
      setLoadingQR(true)
      try {
        const res = await api.getQRCode(selectedSession)
        if (res.qr?.raw && !cancelled) {
          const url = await QRCodeLib.toDataURL(res.qr.raw, { width: 256, margin: 1 })
          if (!cancelled) setQrCode(url)
        }
      } catch { /* ignore */ }
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
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-accent-soft)]"
      >
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className={`text-xs font-bold text-white ${getSessionStatusColor(current?.status || "STOPPED")}`}>
            {selectedSession[0]?.toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--chat-text-primary)]">
            {current?.me?.pushName || selectedSession}
          </p>
          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${getSessionStatusColor(current?.status || "STOPPED")}`} />
            <span className="text-[11px] text-[var(--chat-text-tertiary)]">{getStatusLabel(current?.status || "STOPPED")}</span>
            {current?.me?.id && (
              <span className="truncate text-[10px] text-[var(--chat-text-tertiary)] opacity-50">
                {current.me.id.split("@")[0]}
              </span>
            )}
          </div>
        </div>
        <ChevronDown className={`size-4 text-[var(--chat-text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[var(--chat-border-strong)] bg-white py-1 shadow-lg dark:bg-zinc-900"
          >
            {isScanning && (
              <div className="border-b border-[var(--chat-border)] p-3">
                <p className="mb-2 text-[11px] font-semibold text-[var(--chat-text-tertiary)]">
                  Scan QR Code
                </p>
                <div className="flex justify-center">
                  {loadingQR ? (
                    <div className="flex size-32 items-center justify-center">
                      <RefreshCw className="size-6 animate-spin text-[var(--chat-text-tertiary)]" />
                    </div>
                  ) : qrCode ? (
                    <img
                      src={qrCode}
                      alt="QR Code"
                      className="size-32 rounded-lg"
                    />
                  ) : (
                    <div className="flex size-32 items-center justify-center rounded-lg border-2 border-dashed border-[var(--chat-border)]">
                      <QrCode className="size-10 text-[var(--chat-text-tertiary)]" />
                    </div>
                  )}
                </div>
                <p className="mt-2 text-[10px] text-center text-[var(--chat-text-tertiary)]">
                  Open WhatsApp → Linked Devices → Link a Device
                </p>
              </div>
            )}

            <div className="max-h-[240px] overflow-y-auto">
              {sessions.map((s) => {
                const active = s.name === selectedSession
                return (
                  <button
                    key={s.name}
                    onClick={() => { onSessionChange(s.name); setOpen(false) }}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-[var(--chat-accent-soft)]" : "hover:bg-[var(--chat-accent-soft)]"
                    }`}
                  >
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className={`text-xs font-bold text-white ${getSessionStatusColor(s.status)}`}>
                        {s.name[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] ${active ? "font-bold" : "font-medium"} text-[var(--chat-text-primary)]`}>
                        {s.me?.pushName || s.name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${getSessionStatusColor(s.status)}`} />
                        <span className="text-[10px] text-[var(--chat-text-tertiary)]">{getStatusLabel(s.status)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      {s.status !== "WORKING" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                          onClick={(e) => { e.stopPropagation(); onStartSession(s.name) }}
                          title="Start"
                        >
                          <Play className="size-3.5" />
                        </Button>
                      )}
                      {s.status === "WORKING" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={(e) => { e.stopPropagation(); onStopSession(s.name) }}
                          title="Stop"
                        >
                          <Square className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

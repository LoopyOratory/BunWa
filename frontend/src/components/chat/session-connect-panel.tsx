import { Loader2, Play, QrCode, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/primitives"
import { useSessionQr } from "@/hooks/chat/use-session-qr"
import type { Session } from "@/lib/api"

/**
 * What the chat list shows while its session is not connected: the action
 * that gets it connected, in place. Used to say "start the session above"
 * with no button to do it.
 */
export function SessionConnectPanel({
  session,
  onStart,
  onRestart,
}: {
  session: Session | undefined
  onStart: () => void
  onRestart: () => void
}) {
  const status = session?.status ?? "STOPPED"
  const { qr, loading, error } = useSessionQr(session?.name ?? "", status === "SCAN_QR_CODE")

  if (status === "SCAN_QR_CODE") {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
        <p className="text-[14px] font-semibold text-[var(--chat-text-primary)]">Link this session</p>
        {qr ? (
          <img src={qr} alt={`WhatsApp pairing QR code for session ${session?.name}`} className="size-48 rounded-lg bg-white p-2" />
        ) : loading ? (
          <Skeleton className="size-48 rounded-lg" />
        ) : (
          <div className="flex size-48 items-center justify-center rounded-lg border-2 border-dashed border-[var(--chat-border)]">
            <QrCode className="size-10 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} />
          </div>
        )}
        <ol className="list-inside list-decimal space-y-0.5 text-left text-[12px] text-[var(--chat-text-secondary)]">
          <li>Open WhatsApp on the phone</li>
          <li>Go to Settings, then Linked devices</li>
          <li>Tap Link a device and scan this code</li>
        </ol>
        {error && (
          <p role="alert" className="text-[12px] text-error-foreground">Could not load the QR code. Retrying.</p>
        )}
      </div>
    )
  }

  if (status === "STARTING") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[13px] text-[var(--chat-text-secondary)]">
        <Loader2 className="size-5 animate-spin" />
        Connecting to WhatsApp…
      </div>
    )
  }

  const failed = status === "FAILED"
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="text-[14px] font-semibold text-[var(--chat-text-primary)]">
        {failed ? "This session stopped working" : "This session is stopped"}
      </p>
      <p className="text-[13px] text-[var(--chat-text-secondary)]">
        {failed ? "Restart it to reconnect and see its conversations." : "Start it to see its conversations."}
      </p>
      <Button size="sm" onClick={failed ? onRestart : onStart}>
        {failed ? <RotateCcw className="size-4" strokeWidth={1.75} /> : <Play className="size-4" strokeWidth={1.75} />}
        {failed ? "Restart session" : "Start session"}
      </Button>
    </div>
  )
}

import { useRef, useState } from "react"
import { toast } from "sonner"
import { FileText, Image as ImageIcon, Loader2, ScanText, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { agentApi, type AttachmentResult } from "@/lib/agents-api"

const ACCEPT =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.json,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function AttachmentReaderCard({ agentId }: { agentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AttachmentResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const read = async () => {
    if (!file) {
      toast.error("Choose a document or image first")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const attachment = await agentApi.readAttachment(agentId, file, caption)
      setResult(attachment)
      toast.success(attachment.kind === "image" ? "Image understood" : "Document read")
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not read the attachment"
      setError(message)
      setResult(null)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <ScanText className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Read a document or image</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Test what the agent sees when a customer sends an attachment. PDF, DOCX, TXT, Markdown, CSV and JSON
              are extracted locally. Images are sent to the vision model, which also transcribes visible text.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1">
          <ImageIcon className="size-3" /> Vision
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="attachment-file">Document or image</Label>
          <Input
            ref={inputRef}
            id="attachment-file"
            type="file"
            accept={ACCEPT}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setResult(null)
              setError(null)
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            PDF, DOCX, TXT, MD, CSV, JSON, JPEG, PNG, WEBP, GIF · up to 10 MB for documents, 16 MB for images.
          </p>
        </div>
        <div className="flex items-end">
          <Button onClick={() => void read()} disabled={busy || !file} className="w-full sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {busy ? "Reading…" : "Read attachment"}
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Label htmlFor="attachment-caption">Caption (optional)</Label>
        <Input
          id="attachment-caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="What the sender said with the attachment"
        />
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              {result.kind === "image" ? <ImageIcon className="size-3" /> : <FileText className="size-3" />}
              {result.kind === "image" ? "Image" : "Document"}
            </Badge>
            <span className="min-w-0 truncate text-sm font-medium">{result.filename}</span>
            <span className="text-xs text-muted-foreground">{formatBytes(result.sizeBytes)}</span>
            {result.truncated && <Badge variant="outline">Truncated</Badge>}
            {result.image && (
              <span className="text-xs text-muted-foreground">
                {result.image.width && result.image.height ? `${result.image.width}×${result.image.height} · ` : ""}
                {result.image.model}
              </span>
            )}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted/50 p-3 text-xs leading-5 text-foreground">
            {result.text}
          </pre>
        </div>
      )}
    </div>
  )
}

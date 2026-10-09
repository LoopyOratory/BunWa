import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { Mic, Plus, RefreshCw, Square, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PhoneInput } from "@/components/phone-input"
import { Metric } from "@/components/primitives"
import { api, ApiError } from "@/lib/api"
import { toChatId } from "@/lib/phone"

/*
 * The chat page's send dialogs: new chat, media and interactive sends, and
 * status posts. Media and interactive sends open as a panel above the
 * composer (`variant="panel"`); the others are dialogs.
 */

/* ── Shared shell: a dialog, or a panel above the composer ── */
function ComposerDialog({ open, onOpenChange, title, children, footer, variant = "dialog" }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: ReactNode
  footer: ReactNode
  /** "panel" renders above the composer instead of as a modal. */
  variant?: "dialog" | "panel"
}) {
  useEffect(() => {
    if (variant !== "panel" || !open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [variant, open, onOpenChange])

  if (variant === "panel") {
    if (!open) return null
    return (
      <div
        role="dialog"
        aria-label={title}
        className="surface-overlay absolute inset-x-2 bottom-full z-30 mb-2 flex max-h-[min(70vh,560px)] flex-col rounded-xl md:left-3 md:right-auto md:w-[420px]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-2.5">{footer}</div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto py-2">{children}</div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Shared file picker: click or drag and drop ── */
function FileDropzone({ inputRef, accept, label, onSelect }: {
  inputRef: RefObject<HTMLInputElement | null>
  accept: string
  label: string
  onSelect: (file: File) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const pick = (files: FileList | null) => { const f = files?.[0]; if (f) onSelect(f) }
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { pick(e.target.files); e.target.value = "" }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files) }}
        className={`flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
        }`}
      >
        <Upload className="size-6 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-sm font-medium">Click to select {label}</p>
        <p className="text-xs text-muted-foreground">or drag and drop a file here</p>
      </button>
    </>
  )
}

/* ── Shared picked-file row ── */
function FileRow({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-md" onClick={onRemove} aria-label="Remove file">
        <Trash2 className="size-4" strokeWidth={1.75} />
      </Button>
    </div>
  )
}

/* ── Shared segmented control ── */
function Segmented({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-2" role="group">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          variant={value === opt.value ? "default" : "secondary"}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="flex-1 rounded-md"
        >
          {opt.label}
        </Button>
      ))}
    </div>
  )
}

/* ── New Chat Dialog ── */
export function NewChatDialog({ open, onOpenChange, session, onOpenChat }: {
  open: boolean; onOpenChange: (v: boolean) => void; session: string; onOpenChat: (chatId: string) => void
}) {
  const [country, setCountry] = useState("GH")
  const [phone, setPhone] = useState("")
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleCheck = async () => {
    if (!phone.trim()) return
    setChecking(true)
    setError(null)
    const target = toChatId(country, phone)
    if (!target) { setError("Enter a phone number or a WhatsApp username."); return }
    try {
      const res = await api.checkNumberStatus(session, target)
      if (res.exists && res.number) {
        onOpenChat(res.number.includes("@") ? res.number : `${res.number}@c.us`)
        onOpenChange(false)
        setPhone("")
      } else if (res.exists === false) {
        setError("That number or username is not registered on WhatsApp.")
      } else {
        setError(res.reason ? `Could not check the number or username: ${res.reason}` : "Could not check the number or username. Try again.")
      }
    } catch {
      setError("Could not check the number or username. Try again.")
      toast.error("Failed to check number")
    }
    finally { setChecking(false) }
  }
  return (
    <ComposerDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start new chat"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCheck} disabled={checking || !phone.trim()} className="rounded-md">
            {/* Always mounted: toggling visibility keeps the label from
                shifting when the request starts and stops. */}
            <RefreshCw className={`mr-2 size-4 ${checking ? "animate-spin" : "opacity-0"}`} strokeWidth={1.75} aria-hidden={!checking} />
            Start chat
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Phone number or username</Label>
        <PhoneInput
          country={country}
          onCountryChange={setCountry}
          value={phone}
          onChange={setPhone}
          placeholder="501234567 or @handle"
          onEnter={handleCheck}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
          {error}
        </p>
      )}
    </ComposerDialog>
  )
}

/* ── Send Media Dialog ── */
export function SendMediaDialog({ open, onOpenChange, type, session, chatId, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void
  type: "image" | "file" | "voice" | "video" | "location" | "poll" | "buttons"
  session: string; chatId: string; onSent: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [title, setTitle] = useState("")
  const [pollName, setPollName] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollType, setPollType] = useState<"single" | "multiple">("single")
  const [buttonsBody, setButtonsBody] = useState("")
  const [buttonsList, setButtonsList] = useState<{ id: string; text: string }[]>([
    { id: "", text: "" },
    { id: "", text: "" },
  ])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordTime, setRecordTime] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const reset = () => {
    setFile(null); setCaption(""); setLat(""); setLng(""); setTitle("")
    setPollName(""); setPollOptions(["", ""]); setPollType("single")
    setButtonsBody(""); setButtonsList([{ id: "", text: "" }, { id: "", text: "" }])
    setRecording(false); setRecordedBlob(null); setRecordTime(0); setSendError(null)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(f) })

  const handleSend = async () => {
    setSending(true)
    setSendError(null)
    try {
      if (type === "location") {
        await api.sendLocation(session, chatId, parseFloat(lat), parseFloat(lng), title)
      } else if (type === "poll") {
        const opts = pollOptions.map((o) => o.trim()).filter(Boolean)
        await api.sendPoll(session, chatId, { name: pollName, options: opts, multipleAnswers: pollType === "multiple" })
      } else if (type === "buttons") {
        const btns = buttonsList
          .map((b) => ({ id: b.id.trim(), text: b.text.trim() }))
          .filter((b) => b.text)
          .map((b, i) => ({ id: b.id || `btn_${i + 1}`, text: b.text }))
        await api.sendButtons(session, chatId, buttonsBody, btns)
      } else if (type === "voice" && recordedBlob) {
        const base64 = await new Promise<string>((r) => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(recordedBlob) })
        await api.sendVoice(session, chatId, { mimetype: "audio/ogg", filename: "voice.ogg", data: base64 })
      } else if (file) {
        const base64 = await fileToBase64(file)
        const fd = { mimetype: file.type, filename: file.name, data: base64 }
        if (type === "image") await api.sendImage(session, chatId, fd, caption)
        else if (type === "video") await api.sendVideo(session, chatId, fd, caption)
        else if (type === "file") await api.sendFile(session, chatId, fd, caption)
      }
      toast.success("Sent")
      onSent()
      onOpenChange(false)
      reset()
    } catch (e) {
      const blocked = e instanceof ApiError && e.status === 429
      setSendError(blocked ? e.message : "The message could not be sent. Check the file and try again.")
      if (!blocked) toast.error("Failed to send")
    }
    finally { setSending(false) }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: "audio/ogg" })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/ogg" })
        setRecordedBlob(blob)
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordTime(0)
      recordTimerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000)
    } catch {
      setSendError("Microphone access was denied. Allow it in the browser and try again.")
      toast.error("Microphone access denied")
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const acceptTypes: Record<string, string> = { image: "image/*", video: "video/*", file: "*" }
  const labels: Record<string, string> = { image: "Send image", file: "Send file", voice: "Send voice", video: "Send video", location: "Send location", poll: "Create poll", buttons: "Send buttons" }

  const formatClock = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

  const canSend =
    type === "poll" ? !!pollName.trim()
      : type === "buttons" ? (!!buttonsBody.trim() && buttonsList.filter((b) => b.text.trim()).length > 0)
        : type === "location" ? (!!lat && !!lng)
          : type === "voice" ? !!recordedBlob
            : !!file

  return (
    <ComposerDialog
      variant="panel"
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}
      title={labels[type]}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !canSend} className="rounded-md">
            <RefreshCw className={`mr-2 size-4 ${sending ? "animate-spin" : "opacity-0"}`} strokeWidth={1.75} aria-hidden={!sending} />
            Send
          </Button>
        </>
      }
    >
      {(type === "image" || type === "file" || type === "video") && (
        <>
          {!file ? (
            <FileDropzone inputRef={fileRef} accept={acceptTypes[type]} label={type} onSelect={setFile} />
          ) : (
            <FileRow name={file.name} onRemove={() => setFile(null)} />
          )}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Caption (optional)</Label>
            <Input placeholder="Add a caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
        </>
      )}

      {type === "voice" && (
        <div className="flex flex-col items-center space-y-4 py-4">
          {!recording && !recordedBlob ? (
            <Button
              type="button"
              onClick={startRecording}
              aria-label="Start recording"
              className="size-20 rounded-full"
            >
              <Mic className="size-8" strokeWidth={1.75} />
            </Button>
          ) : recording ? (
            <div className="flex flex-col items-center gap-3">
              <Button
                type="button"
                onClick={stopRecording}
                aria-label="Stop recording"
                className="size-20 animate-pulse rounded-full bg-error text-white hover:bg-error/90"
              >
                <Square className="size-6" fill="currentColor" strokeWidth={1.75} />
              </Button>
              <Metric className="text-sm">{formatClock(recordTime)}</Metric>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm">Recorded <Metric>{formatClock(recordTime)}</Metric></span>
              <Button variant="outline" size="sm" className="rounded-md" onClick={() => { setRecordedBlob(null); setRecordTime(0) }}>Re-record</Button>
            </div>
          )}
        </div>
      )}

      {type === "location" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label className="text-xs">Latitude</Label><Input placeholder="e.g. 5.6037" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
            <div className="space-y-2"><Label className="text-xs">Longitude</Label><Input placeholder="e.g. -0.1870" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Title (optional)</Label>
            <Input placeholder="Location name" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </>
      )}

      {type === "poll" && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Poll question</Label>
            <Input placeholder="What is your question?" value={pollName} onChange={(e) => setPollName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Poll type</Label>
            <Segmented
              value={pollType}
              onChange={(v) => setPollType(v as "single" | "multiple")}
              options={[
                { value: "single", label: "Single choice" },
                { value: "multiple", label: "Multiple choice" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Options</Label>
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => { const n = [...pollOptions]; n[i] = e.target.value; setPollOptions(n) }} />
                {pollOptions.length > 2 && (
                  <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-md" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}>
                    <Trash2 className="size-3" strokeWidth={1.75} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {pollOptions.length < 10 && (
            <Button variant="ghost" size="sm" className="gap-1 rounded-md" onClick={() => setPollOptions([...pollOptions, ""])}>
              <Plus className="size-3.5" strokeWidth={1.75} />
              Add option
            </Button>
          )}
        </>
      )}

      {type === "buttons" && (
        <>
          <div className="space-y-2">
            <Label className="text-xs">Message text</Label>
            <Textarea placeholder="What would you like to say?" value={buttonsBody} onChange={(e) => setButtonsBody(e.target.value)} className="min-h-[80px]" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Buttons</Label>
            {buttonsList.map((btn, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder={`Button ${i + 1} text`} value={btn.text} onChange={(e) => { const n = [...buttonsList]; n[i] = { ...n[i], text: e.target.value }; setButtonsList(n) }} />
                {buttonsList.length > 1 && (
                  <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-md" onClick={() => setButtonsList(buttonsList.filter((_, j) => j !== i))} aria-label={`Remove button ${i + 1}`}>
                    <Trash2 className="size-3" strokeWidth={1.75} />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {buttonsList.length < 3 && (
            <Button variant="ghost" size="sm" className="gap-1 rounded-md" onClick={() => setButtonsList([...buttonsList, { id: "", text: "" }])}>
              <Plus className="size-3.5" strokeWidth={1.75} />
              Add button
            </Button>
          )}
        </>
      )}

      {sendError && (
        <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
          {sendError}
        </p>
      )}
    </ComposerDialog>
  )
}

/* ── Status Dialog ── */
export function StatusDialog({ open, onOpenChange, session, onSent }: { open: boolean; onOpenChange: (v: boolean) => void; session: string; onSent: () => void }) {
  const [statusType, setStatusType] = useState<"text" | "image" | "video">("text")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSend = async () => {
    setSending(true)
    setSendError(null)
    try {
      if (statusType === "text") {
        await api.postTextStatus(session, text)
      } else if (file) {
        const base64 = await new Promise<string>((r) => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(file) })
        const fd = { mimetype: file.type, filename: file.name, data: base64 }
        if (statusType === "image") await api.postImageStatus(session, fd, text)
        else await api.postVideoStatus(session, fd, text)
      }
      toast.success("Status posted")
      onSent()
      onOpenChange(false)
      setText(""); setFile(null)
    } catch (e) {
      // Let the server's client-facing reasons through (a blocked send, an
      // unsupported file shape); anything else keeps the generic fallback.
      const clientFacing = e instanceof ApiError && (e.status === 400 || e.status === 422 || e.status === 429)
      setSendError(clientFacing ? e.message : "The status could not be posted. Try again.")
      if (!clientFacing) toast.error("Failed to post status")
    }
    finally { setSending(false) }
  }

  return (
    <ComposerDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Post status"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || (statusType === "text" ? !text.trim() : !file)} className="rounded-md">
            <RefreshCw className={`mr-2 size-4 ${sending ? "animate-spin" : "opacity-0"}`} strokeWidth={1.75} aria-hidden={!sending} />
            Post status
          </Button>
        </>
      }
    >
      <Segmented
        value={statusType}
        onChange={(v) => { setStatusType(v as "text" | "image" | "video"); setFile(null) }}
        options={[
          { value: "text", label: "Text" },
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
        ]}
      />
      {statusType === "text" ? (
        <Textarea placeholder="What is on your mind?" value={text} onChange={(e) => setText(e.target.value)} className="min-h-[100px]" />
      ) : (
        <>
          {!file ? (
            <FileDropzone inputRef={fileRef} accept={statusType === "image" ? "image/*" : "video/*"} label={statusType} onSelect={setFile} />
          ) : (
            <FileRow name={file.name} onRemove={() => setFile(null)} />
          )}
          <Input placeholder="Caption (optional)" value={text} onChange={(e) => setText(e.target.value)} />
        </>
      )}
      {sendError && (
        <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
          {sendError}
        </p>
      )}
    </ComposerDialog>
  )
}


import { useEffect, useState, useRef, useCallback, useMemo, type ReactNode, type RefObject } from "react"
import { RefreshCw, CircleDot, Trash2, Mic, Square, Plus, Upload, MessageSquare, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ChatProvider, ChatMessages } from "@/components/ui/chat"
import type { ChatUser, ChatMessageData } from "@/components/ui/chat"
import { EmptyState, ErrorState, Metric, Skeleton } from "@/components/primitives"
import { api, type Session, type ChatOverview, type Message, type Contact } from "@/lib/api"
import { useWebSocket } from "@/lib/use-websocket"
import { ChatConversations } from "@/components/chat/chat-conversations"
import { ChatHeader } from "@/components/chat/chat-header"
import { ChatComposerWrapper } from "@/components/chat/chat-composer-wrapper"
import { TemplatePicker } from "@/components/chat/template-picker"
import { mapMessage, resolveUserJid } from "@/components/chat/helpers"

/* ================================================================== */
/*  STORE FAILURE HELPERS                                             */
/* ================================================================== */

/*
 * A session with the message store disabled rejects every store read with a
 * 400 that names the two settings to change. Recognise it in an error message
 * or a raw response body so the UI can point at the fix instead of a
 * generic failure.
 */
function isStoreDisabledError(error: unknown): boolean {
  let text = ""
  if (typeof error === "string") text = error
  else if (error instanceof Error) text = error.message
  else if (error && typeof error === "object") {
    const body = error as { message?: unknown; error?: unknown; detail?: unknown }
    text = [body.message, body.error, body.detail].filter((v): v is string => typeof v === "string").join(" ")
  }
  return /enable noweb store/i.test(text) || /noweb\.store\.enabled/i.test(text)
}

const STORE_DISABLED_TITLE = "Chat history is unavailable"
const STORE_DISABLED_DESCRIPTION = "This session is running without a message store, so BunWa cannot read chats, messages or contacts. Enable the store in the session settings and restart the session. History backfill also needs full sync enabled."

/* ================================================================== */
/*  DIALOGS (ported from old chat-page)                                */
/* ================================================================== */

/* ── Shared dialog shell: one header/footer/scroll shape for all three ── */
function ComposerDialog({ open, onOpenChange, title, children, footer }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  children: ReactNode
  footer: ReactNode
}) {
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
function NewChatDialog({ open, onOpenChange, session, onOpenChat }: {
  open: boolean; onOpenChange: (v: boolean) => void; session: string; onOpenChat: (chatId: string) => void
}) {
  const [phone, setPhone] = useState("")
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handleCheck = async () => {
    if (!phone.trim()) return
    setChecking(true)
    setError(null)
    try {
      const res = await api.checkNumberStatus(session, phone.replace(/\D/g, ""))
      if (res.exists && res.number) { onOpenChat(`${res.number}@c.us`); onOpenChange(false); setPhone("") }
      else setError("That number is not registered on WhatsApp.")
    } catch {
      setError("Could not check the number. Try again.")
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
            {checking && <RefreshCw className="mr-2 size-4 animate-spin" strokeWidth={1.75} />}
            Start chat
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Phone number (with country code)</Label>
        <Input
          placeholder="+233 50 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
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
function SendMediaDialog({ open, onOpenChange, type, session, chatId, onSent }: {
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
    } catch {
      setSendError("The message could not be sent. Check the file and try again.")
      toast.error("Failed to send")
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
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}
      title={labels[type]}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || !canSend} className="rounded-md">
            {sending && <RefreshCw className="mr-2 size-4 animate-spin" strokeWidth={1.75} />}
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
function StatusDialog({ open, onOpenChange, session, onSent }: { open: boolean; onOpenChange: (v: boolean) => void; session: string; onSent: () => void }) {
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
    } catch {
      setSendError("The status could not be posted. Try again.")
      toast.error("Failed to post status")
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
            {sending && <RefreshCw className="mr-2 size-4 animate-spin" strokeWidth={1.75} />}
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

/* ================================================================== */
/*  MAIN CHAT PAGE ORCHESTRATOR                                       */
/* ================================================================== */

interface ChatPageProps { initialSession?: string | null }

export function ChatPage({ initialSession }: ChatPageProps) {
  /* ── State ── */
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsError, setSessionsError] = useState(false)
  const [selectedSession, setSelectedSession] = useState("")
  const [chats, setChats] = useState<ChatOverview[]>([])
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map())
  const [contactsError, setContactsError] = useState(false)
  const [selectedChat, setSelectedChat] = useState<ChatOverview | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [storeDisabled, setStoreDisabled] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessageData | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageData | null>(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [userPicture, setUserPicture] = useState<string | null>(null)
  const [pictureError, setPictureError] = useState(false)
  const [contactPictures, setContactPictures] = useState<Map<string, string>>(new Map())
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [mediaDialog, setMediaDialog] = useState<{ open: boolean; type: "image" | "file" | "voice" | "video" | "location" | "poll" | "buttons" }>({ open: false, type: "image" })

  const currentSession = sessions.find((s) => s.name === selectedSession)
  const isWorking = currentSession?.status === "WORKING"
  const currentUserJid = resolveUserJid(currentSession || {})

  /* ── Data Loading ── */
  const loadSessions = useCallback(async () => {
    try { setSessions(await api.getSessions()); setSessionsError(false) }
    catch { setSessionsError(true) }
  }, [])
  useEffect(() => { loadSessions(); const iv = setInterval(loadSessions, 30000); return () => clearInterval(iv) }, [loadSessions])
  useEffect(() => { if (sessions.length > 0 && !selectedSession) setSelectedSession(initialSession || sessions[0].name) }, [sessions, selectedSession, initialSession])
  useEffect(() => { setSelectedChat(null); setMessages([]); setStoreDisabled(false) }, [selectedSession])

  useEffect(() => {
    if (!selectedSession) { setUserPicture(null); setPictureError(false); return }
    const s = sessions.find(s => s.name === selectedSession)
    if (!s?.me?.id) return
    setPictureError(false)
    const jid = resolveUserJid(s)
    api.getContactPicture(selectedSession, jid).then(res => {
      if (res.profilePictureURL) setUserPicture(res.profilePictureURL)
    }).catch(() => setPictureError(true))
  }, [selectedSession, sessions])

  useEffect(() => {
    if (!selectedChat || !selectedSession) return
    if (selectedChat.picture) return
    if (contactPictures.has(selectedChat.id)) return
    api.getContactPicture(selectedSession, selectedChat.id).then(res => {
      if (res.profilePictureURL) {
        setContactPictures(prev => { const m = new Map(prev); m.set(selectedChat.id, res.profilePictureURL!); return m })
      }
    }).catch(() => setPictureError(true))
  }, [selectedChat, selectedSession])

  const loadContacts = useCallback(async () => {
    if (!selectedSession || !isWorking) { setContacts(new Map()); return }
    try {
      const list = await api.getContacts(selectedSession, 500, 0)
      setContacts(new Map(list.map((c) => [c.id, c])))
      setContactsError(false)
    } catch { setContactsError(true) }
  }, [selectedSession, isWorking])
  useEffect(() => { loadContacts() }, [loadContacts])

  const chatsLoadedForSessionRef = useRef<string | null>(null)
  const loadChats = useCallback(async () => {
    if (!selectedSession || !isWorking) { setChats([]); return }
    // Only show the blocking "Loading conversations..." placeholder on the
    // first load for this session — background refreshes (5s poll, WS
    // events) should update the list in place without blanking it out.
    const isFirstLoad = chatsLoadedForSessionRef.current !== selectedSession
    if (isFirstLoad) setLoadingChats(true)
    try {
      setChats(await api.getChatsOverview(selectedSession))
      chatsLoadedForSessionRef.current = selectedSession
      setStoreDisabled(false)
    }
    catch (error) {
      if (isStoreDisabledError(error)) setStoreDisabled(true)
      else toast.error("Failed to load chats")
    }
    finally { if (isFirstLoad) setLoadingChats(false) }
  }, [selectedSession, isWorking])
  useEffect(() => { loadChats() }, [loadChats])

  const loadMessages = useCallback(async (chatId: string) => {
    if (!selectedSession) return
    setLoadingMessages(true)
    try {
      const msgs = await api.getMessages(selectedSession, chatId, 50, 0)
      setMessages(msgs)
      setHasMoreMessages(msgs.length === 50)
      api.sendSeen(selectedSession, chatId).catch(() => {})
    } catch (error) {
      if (isStoreDisabledError(error)) setStoreDisabled(true)
      else toast.error("Failed to load messages")
    }
    finally { setLoadingMessages(false) }
  }, [selectedSession])
  useEffect(() => { if (selectedChat) loadMessages(selectedChat.id) }, [selectedChat, loadMessages])

  /* ── WebSocket ── */
  const selectedSessionRef = useRef(selectedSession)
  selectedSessionRef.current = selectedSession
  const selectedChatRef = useRef(selectedChat?.id)
  selectedChatRef.current = selectedChat?.id
  const loadChatsRef = useRef(loadChats)
  loadChatsRef.current = loadChats
  const chatsLoadPendingRef = useRef(false)

  const handleWsMessage = useCallback((data: any) => {
    if (!data || typeof data !== "object") return
    const event = data.event as string | undefined
    const session = data.session as string | undefined
    const payload = data.payload
    if (!event || !payload) return
    if (session && selectedSessionRef.current && session !== selectedSessionRef.current) return

    const openChatId = selectedChatRef.current
    const belongsToOpenChat = !!openChatId && (payload.from === openChatId || payload.to === openChatId)

    if (event === "message" || event === "message.any") {
      if (belongsToOpenChat) {
        setMessages((prev) => (prev.some((m) => m.id === payload.id) ? prev : [payload, ...prev]))
        api.sendSeen(selectedSessionRef.current, openChatId!).catch(() => {})
      }
    } else if (event === "message.ack") {
      if (belongsToOpenChat) {
        setMessages((prev) => prev.map((m) => (m.id === payload.id ? { ...m, ack: payload.ack, ackName: payload.ackName } : m)))
      }
    } else if (event === "message.reaction") {
      const messageId = payload.reaction?.messageId
      const text = payload.reaction?.text
      if (belongsToOpenChat && messageId) {
        const reactor = payload.participant || payload.from
        setMessages((prev) => prev.map((m) => {
          if (m.id !== messageId) return m
          const filtered = (m.reactions || []).filter((r) => r.key?.remoteJid !== reactor)
          if (!text) return { ...m, reactions: filtered }
          return { ...m, reactions: [...filtered, { text, key: { fromMe: payload.fromMe, remoteJid: reactor }, senderTimestampMs: (payload.timestamp || 0) * 1000 }] }
        }))
      }
    } else {
      return
    }

    // Sidebar refresh (last-message preview / unread badges) — debounced,
    // still needed for chats other than the one currently open.
    if (!chatsLoadPendingRef.current) {
      chatsLoadPendingRef.current = true
      setTimeout(() => { chatsLoadPendingRef.current = false; loadChatsRef.current() }, 2000)
    }
  }, [])
  useWebSocket({ session: selectedSession || "*", events: "message,message.any,message.ack,message.reaction", onMessage: handleWsMessage })

  /* ── 5-second polling fallback for unread counts ── */
  useEffect(() => {
    if (!isWorking) return
    const iv = setInterval(loadChats, 5000)
    return () => clearInterval(iv)
  }, [loadChats, isWorking])

  /* ── Current User for ChatProvider ── */
  const chatUser: ChatUser = useMemo(() => ({
    id: currentUserJid,
    name: currentSession?.me?.pushName || selectedSession,
    avatar: userPicture || undefined,
    status: isWorking ? "online" : "offline",
  }), [currentUserJid, currentSession, selectedSession, userPicture, isWorking])

  /* ── Mapped Messages ── */
  const mappedMessages: ChatMessageData[] = useMemo(
    () => [...messages].reverse().map((m) => mapMessage(m, contacts, currentUserJid)),
    [messages, contacts, currentUserJid]
  )

  /* ── Actions ── */
  const handleStartSession = async (name: string) => {
    try { await api.startSession(name); toast.success("Starting"); await loadSessions() }
    catch { toast.error("Failed to start") }
  }

  const handleStopSession = async (name: string) => {
    try { await api.stopSession(name); toast.success("Stopped"); await loadSessions() }
    catch { toast.error("Failed to stop") }
  }

  const handleSend = async (text: string) => {
    if (!selectedSession || !selectedChat) return
    if (editingMessage) {
      try { await api.editMessage(selectedSession, selectedChat.id, editingMessage.id, text); setEditingMessage(null) }
      catch { toast.error("Failed to edit") }
      return
    }
    const replyToId = replyingTo?.id
    setReplyingTo(null)
    // Optimistic append — show the message immediately instead of waiting on
    // the send request + a reload. Reconciled below once the send resolves;
    // the later WS echo (same real id) will no-op against it via dedup.
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const optimistic: Message = {
      id: tempId,
      timestamp: Math.floor(Date.now() / 1000),
      from: currentUserJid,
      fromMe: true,
      to: selectedChat.id,
      body: text,
      hasMedia: false,
      ack: 0,
      ackName: "PENDING",
      replyTo: replyToId || null,
    }
    setMessages((prev) => [optimistic, ...prev])
    try {
      const sent = await api.sendText(selectedSession, selectedChat.id, text, replyToId)
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...optimistic, ...sent, id: sent?.id || tempId } : m)))
      loadChats()
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      toast.error("Failed to send")
    }
  }

  const handleVoiceRecorded = useCallback(async (base64: string, mimetype: string) => {
    if (!selectedSession || !selectedChat) return
    try {
      await api.sendVoice(selectedSession, selectedChat.id, { mimetype, filename: "voice.webm", data: base64 })
      toast.success("Voice sent")
      loadMessages(selectedChat.id)
      loadChats()
    } catch { toast.error("Failed to send voice") }
  }, [selectedSession, selectedChat])

  const handleReactionAdd = async (messageId: string, emoji: string) => {
    if (!selectedSession || !selectedChat) return
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        const existing = m.reactions?.find((r) => r.text === emoji)
        if (existing) return m
        return {
          ...m,
          reactions: [...(m.reactions || []), { text: emoji, key: { fromMe: true }, senderTimestampMs: Date.now() }],
        }
      })
    )
    try { await api.setReaction(selectedSession, selectedChat.id, messageId, emoji) }
    catch { setMessages((prev) => prev.map((m) => m.id !== messageId ? m : { ...m, reactions: m.reactions?.filter((r) => r.text !== emoji) })); toast.error("Failed to react") }
  }

  const handleReactionRemove = async (messageId: string, emoji: string) => {
    if (!selectedSession || !selectedChat) return
    const prevMessages = messages
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m
        return { ...m, reactions: m.reactions?.filter((r) => r.text !== emoji) }
      })
    )
    try { await api.setReaction(selectedSession, selectedChat.id, messageId, "") }
    catch { setMessages(prevMessages); toast.error("Failed to remove reaction") }
  }

  const handleReply = (msg: ChatMessageData) => {
    const original = messages.find((m) => m.id === msg.id)
    if (original) setReplyingTo(msg)
  }

  const handleEdit = (msg: ChatMessageData) => {
    setEditingMessage(msg)
  }

  const handleDelete = async (messageId: string) => {
    if (!selectedSession || !selectedChat) return
    try { await api.deleteMessage(selectedSession, selectedChat.id, messageId); await loadMessages(selectedChat.id) }
    catch { toast.error("Failed to delete") }
  }

  const handlePin = async (messageId: string) => {
    if (!selectedSession || !selectedChat) return
    try { await api.pinMessage(selectedSession, selectedChat.id, messageId); toast.success("Pinned") }
    catch { toast.error("Failed to pin") }
  }

  const handleLoadMore = async () => {
    if (!selectedSession || !selectedChat) return
    try {
      const older = await api.getMessages(selectedSession, selectedChat.id, 50, messages.length)
      if (older.length > 0) {
        setMessages((prev) => [...prev, ...older])
        setHasMoreMessages(older.length === 50)
      } else {
        setHasMoreMessages(false)
      }
    } catch { toast.error("Failed to load older messages") }
  }

  const handleSelectChat = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId)
    if (chat) {
      setSelectedChat(chat)
      setReplyingTo(null)
      setEditingMessage(null)
      api.readChatMessages(selectedSession, chatId).catch(() => {})
    }
  }

  const handleNewChatOpen = (chatId: string) => {
    const fakeChat: ChatOverview = { id: chatId, name: chatId.split("@")[0] }
    setSelectedChat(fakeChat)
    setChats((prev) => prev.some((c) => c.id === chatId) ? prev : [fakeChat, ...prev])
  }

  const handleTyping = (isTyping: boolean) => {
    if (!selectedSession || !selectedChat || !isWorking) return
    if (isTyping) api.startTyping(selectedSession, selectedChat.id).catch(() => {})
    else api.stopTyping(selectedSession, selectedChat.id).catch(() => {})
  }

  /* ── Empty state: no session ── */
  if (!selectedSession) {
    return (
      <ChatProvider currentUser={chatUser} theme="whatsapp" className="h-dvh" messageGroupingInterval={120}>
        <div className="flex h-full flex-col overflow-hidden bg-[var(--chat-bg-main)]">
          <div className="p-3 md:hidden">
            <SidebarTrigger />
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            {sessionsError ? (
              <div className="w-full max-w-md">
                <ErrorState
                  title="Could not load sessions"
                  description="The sessions API did not respond."
                  onRetry={loadSessions}
                />
              </div>
            ) : (
              <EmptyState
                icon={<CircleDot className="size-6" strokeWidth={1.75} />}
                title="No active sessions"
                description="Create and start a session first."
              />
            )}
          </div>
        </div>
      </ChatProvider>
    )
  }

  /* ── No chat selected ── */
  if (!selectedChat) {
    return (
      <ChatProvider currentUser={chatUser} theme="whatsapp" className="h-dvh" messageGroupingInterval={120}>
        <div className="flex h-full overflow-hidden bg-[var(--chat-bg-main)]">
          <ChatConversations
            sessions={sessions}
            selectedSession={selectedSession}
            onSessionChange={setSelectedSession}
            onStartSession={handleStartSession}
            onStopSession={handleStopSession}
            isWorking={isWorking}
            chats={chats}
            contacts={contacts}
            selectedChatId={null}
            onSelectChat={handleSelectChat}
            loadingChats={loadingChats}
            userPicture={userPicture}
            onOpenNewChat={() => setNewChatOpen(true)}
            onOpenStatus={() => setStatusOpen(true)}
            storeDisabled={storeDisabled}
            onRetryChats={loadChats}
          />
          <div className="chat-wallpaper hidden flex-1 items-center justify-center px-4 md:flex">
            {storeDisabled ? (
              <div className="w-full max-w-md">
                <ErrorState
                  title={STORE_DISABLED_TITLE}
                  description={STORE_DISABLED_DESCRIPTION}
                  onRetry={loadChats}
                />
              </div>
            ) : (
              <EmptyState
                icon={<MessageSquare className="size-6" strokeWidth={1.75} />}
                title="Select a conversation"
                description="Choose a chat from the list to start messaging."
              />
            )}
          </div>
          <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={handleNewChatOpen} />
          <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={loadChats} />
        </div>
      </ChatProvider>
    )
  }

  /* ── Full chat view ── */
  const picture = selectedChat.picture || contactPictures.get(selectedChat.id)

  return (
    <ChatProvider
      currentUser={chatUser}
      theme="whatsapp"
      className="h-dvh"
      messageGroupingInterval={120}
      onReactionAdd={handleReactionAdd}
      onReactionRemove={handleReactionRemove}
      onReply={handleReply}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onPin={handlePin}
    >
      <div className="flex h-full overflow-hidden bg-[var(--chat-bg-main)]">
        {/* Sidebar */}
        <div className="hidden md:flex">
          <ChatConversations
            sessions={sessions}
            selectedSession={selectedSession}
            onSessionChange={setSelectedSession}
            onStartSession={handleStartSession}
            onStopSession={handleStopSession}
            isWorking={isWorking}
            chats={chats}
            contacts={contacts}
            selectedChatId={selectedChat.id}
            onSelectChat={handleSelectChat}
            loadingChats={loadingChats}
            userPicture={userPicture}
            onOpenNewChat={() => setNewChatOpen(true)}
            onOpenStatus={() => setStatusOpen(true)}
            storeDisabled={storeDisabled}
            onRetryChats={loadChats}
          />
        </div>

        {/* Main Panel */}
        <main className="grid min-w-0 flex-1 bg-[var(--chat-bg-main)]" style={{ gridTemplateRows: "auto 1fr auto" }}>
          <ChatHeader
            chat={selectedChat}
            contacts={contacts}
            picture={picture}
            onBack={() => { setSelectedChat(null); setMessages([]) }}
            onArchive={() => {
              if (selectedSession) api.archiveChat(selectedSession, selectedChat.id).then(() => { toast.success("Archived"); loadChats(); setSelectedChat(null) }).catch(() => toast.error("Could not archive the chat"))
            }}
            onMarkUnread={() => {
              if (selectedSession) api.unreadChat(selectedSession, selectedChat.id).then(() => toast.success("Marked unread")).catch(() => toast.error("Could not mark the chat unread"))
            }}
          />

          <div className="flex min-h-0 flex-col overflow-hidden">
            {(contactsError || pictureError) && !storeDisabled && (
              <div role="alert" className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
                <TriangleAlert className="size-3.5 shrink-0" strokeWidth={1.75} />
                Some contact details could not be loaded. Names and photos may be missing.
              </div>
            )}
            {storeDisabled ? (
              <div className="min-h-0 overflow-y-auto p-4">
                <ErrorState
                  title={STORE_DISABLED_TITLE}
                  description={STORE_DISABLED_DESCRIPTION}
                  onRetry={() => { loadMessages(selectedChat.id); loadChats() }}
                />
              </div>
            ) : loadingMessages && mappedMessages.length === 0 ? (
              <div className="flex flex-col gap-4 p-4" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}>
                    <Skeleton className={`h-16 rounded-2xl ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
                  </div>
                ))}
              </div>
            ) : (
              <ChatMessages
                messages={mappedMessages}
                hasMore={hasMoreMessages}
                onLoadMore={handleLoadMore}
              />
            )}
          </div>

          {/* Composer toolbar: template picker above the input, visible on
              mobile where the sidebar is hidden. */}
          <div className="border-t border-[var(--chat-border)] bg-[var(--chat-bg-composer)] backdrop-blur-[20px]">
            <div className="flex items-center gap-2 px-3 pt-2">
              <TemplatePicker
                session={selectedSession}
                chatId={selectedChat.id}
                onSent={() => { loadMessages(selectedChat.id); loadChats() }}
              />
            </div>
            <ChatComposerWrapper
              onSend={handleSend}
              onTyping={handleTyping}
              placeholder={editingMessage ? "Edit message" : "Type a message"}
              disabled={!isWorking}
              replyingTo={editingMessage || replyingTo}
              onCancelReply={() => { setReplyingTo(null); setEditingMessage(null) }}
              onOpenMediaDialog={(type) => setMediaDialog({ open: true, type })}
              onVoiceRecorded={handleVoiceRecorded}
            />
          </div>
        </main>

        {/* Dialogs */}
        <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={handleNewChatOpen} />
        <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={loadChats} />
        <SendMediaDialog open={mediaDialog.open} onOpenChange={(v) => setMediaDialog((p) => ({ ...p, open: v }))} type={mediaDialog.type} session={selectedSession} chatId={selectedChat.id} onSent={() => { loadMessages(selectedChat.id); loadChats() }} />
      </div>
    </ChatProvider>
  )
}

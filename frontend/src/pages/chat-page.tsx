import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { RefreshCw, CircleDot, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ChatProvider, ChatMessages } from "@/components/ui/chat"
import type { ChatUser, ChatMessageData } from "@/components/ui/chat"
import { api, type Session, type ChatOverview, type Message, type Contact } from "@/lib/api"
import { useWebSocket } from "@/lib/use-websocket"
import { ChatConversations } from "@/components/chat/chat-conversations"
import { ChatHeader } from "@/components/chat/chat-header"
import { ChatComposerWrapper } from "@/components/chat/chat-composer-wrapper"
import { mapMessage, resolveUserJid } from "@/components/chat/helpers"

/* ================================================================== */
/*  DIALOGS (ported from old chat-page)                                */
/* ================================================================== */

/* ── New Chat Dialog ── */
function NewChatDialog({ open, onOpenChange, session, onOpenChat }: {
  open: boolean; onOpenChange: (v: boolean) => void; session: string; onOpenChat: (chatId: string) => void
}) {
  const [phone, setPhone] = useState("")
  const [checking, setChecking] = useState(false)
  const handleCheck = async () => {
    if (!phone.trim()) return
    setChecking(true)
    try {
      const res = await api.checkNumberStatus(session, phone.replace(/\D/g, ""))
      if (res.exists && res.number) { onOpenChat(`${res.number}@c.us`); onOpenChange(false); setPhone("") }
      else toast.error("Number not found on WhatsApp")
    } catch { toast.error("Failed to check number") }
    finally { setChecking(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Start New Chat</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-xs text-muted-foreground">Phone number (with country code)</Label>
          <Input placeholder="+123****7890" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCheck()} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCheck} disabled={checking || !phone.trim()}>
            {checking && <RefreshCw className="size-4 animate-spin mr-2" />}Start Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Send Media Dialog ── */
function SendMediaDialog({ open, onOpenChange, type, session, chatId, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void
  type: "image" | "file" | "voice" | "video" | "location" | "poll"
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
  const [sending, setSending] = useState(false)
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
    setRecording(false); setRecordedBlob(null); setRecordTime(0)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(f) })

  const handleSend = async () => {
    setSending(true)
    try {
      if (type === "location") {
        await api.sendLocation(session, chatId, parseFloat(lat), parseFloat(lng), title)
      } else if (type === "poll") {
        const opts = pollOptions.map((o) => o.trim()).filter(Boolean)
        await api.sendPoll(session, chatId, { name: pollName, values: opts, multipleAnswers: pollType === "multiple" })
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
      toast.success("Sent!")
      onSent()
      onOpenChange(false)
      reset()
    } catch { toast.error("Failed to send") }
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
    } catch { toast.error("Microphone access denied") }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const acceptTypes: Record<string, string> = { image: "image/*", video: "video/*", file: "*" }
  const labels: Record<string, string> = { image: "Send Image", file: "Send File", voice: "Send Voice", video: "Send Video", location: "Send Location", poll: "Create Poll" }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{labels[type]}</DialogTitle></DialogHeader>

        {(type === "image" || type === "file" || type === "video") && (
          <div className="space-y-3 py-2">
            <input ref={fileRef} type="file" accept={acceptTypes[type]} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
            {!file ? (
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed rounded-xl py-10 flex flex-col items-center gap-3 hover:bg-muted/50 cursor-pointer transition-colors">
                <p className="text-sm font-medium">Click to select {type}</p>
                <p className="text-xs text-muted-foreground">or drag and drop</p>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                <span className="text-sm truncate flex-1">{file.name}</span>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setFile(null)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )}
            <Label className="text-xs text-muted-foreground">Caption (optional)</Label>
            <Input placeholder="Add a caption..." value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
        )}

        {type === "voice" && (
          <div className="space-y-4 py-4 flex flex-col items-center">
            {!recording && !recordedBlob ? (
              <button onClick={startRecording} className="size-20 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:scale-105 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              </button>
            ) : recording ? (
              <div className="flex flex-col items-center gap-3">
                <button onClick={stopRecording} className="size-20 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 animate-pulse">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
                <span className="text-sm font-mono">{String(Math.floor(recordTime/60)).padStart(2,"0")}:{String(recordTime%60).padStart(2,"0")}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <span className="text-sm">Recorded {String(Math.floor(recordTime/60)).padStart(2,"0")}:{String(recordTime%60).padStart(2,"0")}</span>
                <Button variant="outline" size="sm" onClick={() => { setRecordedBlob(null); setRecordTime(0) }}>Re-record</Button>
              </div>
            )}
          </div>
        )}

        {type === "location" && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Latitude</Label><Input placeholder="5.6037" value={lat} onChange={(e) => setLat(e.target.value)} /></div>
              <div><Label className="text-xs">Longitude</Label><Input placeholder="-0.1870" value={lng} onChange={(e) => setLng(e.target.value)} /></div>
            </div>
            <Label className="text-xs">Title (optional)</Label>
            <Input placeholder="Location name" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}

        {type === "poll" && (
          <div className="space-y-3 py-2">
            <Label className="text-xs">Poll Question</Label>
            <Input placeholder="What's your question?" value={pollName} onChange={(e) => setPollName(e.target.value)} />
            <Label className="text-xs">Poll Type</Label>
            <div className="flex gap-2">
              <button onClick={() => setPollType("single")} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${pollType === "single" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Single Choice</button>
              <button onClick={() => setPollType("multiple")} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${pollType === "multiple" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>Multiple Choice</button>
            </div>
            <Label className="text-xs">Options</Label>
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => { const n = [...pollOptions]; n[i] = e.target.value; setPollOptions(n) }} />
                {pollOptions.length > 2 && (
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
            ))}
            {pollOptions.length < 10 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setPollOptions([...pollOptions, ""])}>
                + Add Option
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || (type === "poll" ? !pollName.trim() : type === "location" ? !lat || !lng : type === "voice" ? !recordedBlob : !file)}>
            {sending && <RefreshCw className="size-4 animate-spin mr-2" />}Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Status Dialog ── */
function StatusDialog({ open, onOpenChange, session, onSent }: { open: boolean; onOpenChange: (v: boolean) => void; session: string; onSent: () => void }) {
  const [statusType, setStatusType] = useState<"text" | "image" | "video">("text")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSend = async () => {
    setSending(true)
    try {
      if (statusType === "text") {
        await api.postTextStatus(session, text)
      } else if (file) {
        const base64 = await new Promise<string>((r) => { const reader = new FileReader(); reader.onload = () => r(reader.result as string); reader.readAsDataURL(file) })
        const fd = { mimetype: file.type, filename: file.name, data: base64 }
        if (statusType === "image") await api.postImageStatus(session, fd, text)
        else await api.postVideoStatus(session, fd, text)
      }
      toast.success("Status posted!")
      onSent()
      onOpenChange(false)
      setText(""); setFile(null)
    } catch { toast.error("Failed to post status") }
    finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Post Status</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            {(["text", "image", "video"] as const).map((t) => (
              <button key={t} onClick={() => { setStatusType(t); setFile(null) }} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium capitalize transition-colors ${statusType === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{t}</button>
            ))}
          </div>
          {statusType === "text" ? (
            <Textarea placeholder="What's on your mind?" value={text} onChange={(e) => setText(e.target.value)} className="min-h-[100px]" />
          ) : (
            <>
              <input ref={fileRef} type="file" accept={statusType === "image" ? "image/*" : "video/*"} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {!file ? (
                <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-2 hover:bg-muted/50 cursor-pointer">
                  <span className="text-sm">Select {statusType}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted">
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setFile(null)}><Trash2 className="size-4" /></Button>
                </div>
              )}
              <Input placeholder="Caption (optional)" value={text} onChange={(e) => setText(e.target.value)} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || (statusType === "text" ? !text.trim() : !file)}>
            {sending && <RefreshCw className="size-4 animate-spin mr-2" />}Post Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================== */
/*  MAIN CHAT PAGE ORCHESTRATOR                                       */
/* ================================================================== */

interface ChatPageProps { initialSession?: string | null }

export function ChatPage({ initialSession }: ChatPageProps) {
  /* ── State ── */
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState("")
  const [chats, setChats] = useState<ChatOverview[]>([])
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map())
  const [selectedChat, setSelectedChat] = useState<ChatOverview | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ChatMessageData | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessageData | null>(null)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [userPicture, setUserPicture] = useState<string | null>(null)
  const [contactPictures, setContactPictures] = useState<Map<string, string>>(new Map())
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [mediaDialog, setMediaDialog] = useState<{ open: boolean; type: "image" | "file" | "voice" | "video" | "location" | "poll" }>({ open: false, type: "image" })

  const currentSession = sessions.find((s) => s.name === selectedSession)
  const isWorking = currentSession?.status === "WORKING"
  const currentUserJid = resolveUserJid(currentSession || {})

  /* ── Data Loading ── */
  const loadSessions = useCallback(async () => { try { setSessions(await api.getSessions()) } catch {} }, [])
  useEffect(() => { loadSessions(); const iv = setInterval(loadSessions, 30000); return () => clearInterval(iv) }, [loadSessions])
  useEffect(() => { if (sessions.length > 0 && !selectedSession) setSelectedSession(initialSession || sessions[0].name) }, [sessions, selectedSession, initialSession])
  useEffect(() => { setSelectedChat(null); setMessages([]) }, [selectedSession])

  useEffect(() => {
    if (!selectedSession) { setUserPicture(null); return }
    const s = sessions.find(s => s.name === selectedSession)
    if (!s?.me?.id) return
    const jid = resolveUserJid(s)
    api.getContactPicture(selectedSession, jid).then(res => {
      if (res.profilePictureURL) setUserPicture(res.profilePictureURL)
    }).catch(() => {})
  }, [selectedSession, sessions])

  useEffect(() => {
    if (!selectedChat || !selectedSession) return
    if (selectedChat.picture) return
    if (contactPictures.has(selectedChat.id)) return
    api.getContactPicture(selectedSession, selectedChat.id).then(res => {
      if (res.profilePictureURL) {
        setContactPictures(prev => { const m = new Map(prev); m.set(selectedChat.id, res.profilePictureURL!); return m })
      }
    }).catch(() => {})
  }, [selectedChat, selectedSession])

  const loadContacts = useCallback(async () => {
    if (!selectedSession || !isWorking) { setContacts(new Map()); return }
    try {
      const list = await api.getContacts(selectedSession, 500, 0)
      setContacts(new Map(list.map((c) => [c.id, c])))
    } catch {}
  }, [selectedSession, isWorking])
  useEffect(() => { loadContacts() }, [loadContacts])

  const loadChats = useCallback(async () => {
    if (!selectedSession || !isWorking) { setChats([]); return }
    setLoadingChats(true)
    try { setChats(await api.getChatsOverview(selectedSession)) }
    catch { toast.error("Failed to load chats") }
    finally { setLoadingChats(false) }
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
    } catch { toast.error("Failed to load messages") }
    finally { setLoadingMessages(false) }
  }, [selectedSession])
  useEffect(() => { if (selectedChat) loadMessages(selectedChat.id) }, [selectedChat, loadMessages])

  /* ── WebSocket ── */
  const selectedSessionRef = useRef(selectedSession)
  selectedSessionRef.current = selectedSession
  const selectedChatRef = useRef(selectedChat?.id)
  selectedChatRef.current = selectedChat?.id
  const loadMessagesRef = useRef(loadMessages)
  loadMessagesRef.current = loadMessages
  const loadChatsRef = useRef(loadChats)
  loadChatsRef.current = loadChats
  const chatsLoadPendingRef = useRef(false)

  const handleWsMessage = useCallback((data: any) => {
    if (!data || typeof data !== "object") return
    if (data.session && selectedSessionRef.current && data.session !== selectedSessionRef.current) return
    const event = data.event as string | undefined
    if (!event) return
    if (["message", "message.any", "message.ack", "message.reaction"].includes(event)) {
      if (selectedChatRef.current) loadMessagesRef.current(selectedChatRef.current)
      if (!chatsLoadPendingRef.current) {
        chatsLoadPendingRef.current = true
        setTimeout(() => { chatsLoadPendingRef.current = false; loadChatsRef.current() }, 2000)
      }
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
    try { await api.startSession(name); toast.success("Starting..."); await loadSessions() }
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
    try {
      await api.sendText(selectedSession, selectedChat.id, text, replyingTo?.id)
      setReplyingTo(null)
      await loadMessages(selectedChat.id)
      await loadChats()
    } catch { toast.error("Failed to send") }
  }

  const handleVoiceRecorded = useCallback(async (base64: string, mimetype: string) => {
    if (!selectedSession || !selectedChat) return
    try {
      await api.sendVoice(selectedSession, selectedChat.id, { mimetype, filename: "voice.webm", data: base64 })
      toast.success("Voice sent!")
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
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--chat-bg-main)]">
        <div className="p-3 md:hidden">
          <SidebarTrigger />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <CircleDot className="mx-auto mb-3 size-10 text-[var(--chat-text-tertiary)]" />
            <p className="text-sm text-[var(--chat-text-secondary)]">No active sessions</p>
            <p className="text-xs text-[var(--chat-text-tertiary)] mt-1">Create and start a session first</p>
          </div>
        </div>
      </div>
    )
  }

  /* ── No chat selected ── */
  if (!selectedChat) {
    return (
      <div className="flex h-dvh overflow-hidden bg-[var(--chat-bg-main)]">
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
        />
        <div className="hidden flex-1 md:flex items-center justify-center">
          <div className="text-center">
            <CircleDot className="mx-auto mb-3 size-12 text-[var(--chat-text-tertiary)]" />
            <p className="text-sm text-[var(--chat-text-secondary)]">Select a conversation</p>
          </div>
        </div>
        <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={handleNewChatOpen} />
        <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={loadChats} />
      </div>
    )
  }

  /* ── Full chat view ── */
  const picture = selectedChat.picture || contactPictures.get(selectedChat.id)

  return (
    <ChatProvider
      currentUser={chatUser}
      theme="lunar"
      className="h-dvh"
      messageGroupingInterval={120}
      style={{
        "--chat-accent": "#10B981",
        "--chat-accent-soft": "rgba(16, 185, 129, 0.08)",
        "--chat-green": "#10B981",
        "--chat-bubble-outgoing": "#10B981",
        "--chat-bubble-outgoing-text": "#FFFFFF",
      } as React.CSSProperties}
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
          />
        </div>

        {/* Main Panel */}
        <main className="flex-1 min-w-0 grid bg-[var(--chat-bg-main)]" style={{ gridTemplateRows: "auto 1fr auto" }}>
          <ChatHeader
            chat={selectedChat}
            contacts={contacts}
            picture={picture}
            onBack={() => { setSelectedChat(null); setMessages([]) }}
            onArchive={() => {
              if (selectedSession) api.archiveChat(selectedSession, selectedChat.id).then(() => { toast.success("Archived"); loadChats(); setSelectedChat(null) }).catch(() => toast.error("Failed"))
            }}
            onMarkUnread={() => {
              if (selectedSession) api.unreadChat(selectedSession, selectedChat.id).then(() => toast.success("Marked unread")).catch(() => toast.error("Failed"))
            }}
          />

          <div className="flex flex-col min-h-0 overflow-hidden">
            {loadingMessages && mappedMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <RefreshCw className="mx-auto mb-2 size-6 animate-spin text-[var(--chat-text-tertiary)]" />
                  <p className="text-xs text-[var(--chat-text-tertiary)]">Loading messages...</p>
                </div>
              </div>
            ) : (
              <ChatMessages
                messages={mappedMessages}
                hasMore={hasMoreMessages}
                onLoadMore={handleLoadMore}
              />
            )}
          </div>

          <ChatComposerWrapper
            onSend={handleSend}
            onTyping={handleTyping}
            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
            disabled={!isWorking}
            replyingTo={editingMessage || replyingTo}
            onCancelReply={() => { setReplyingTo(null); setEditingMessage(null) }}
            onOpenMediaDialog={(type) => setMediaDialog({ open: true, type })}
            onVoiceRecorded={handleVoiceRecorded}
          />
        </main>

        {/* Dialogs */}
        <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={handleNewChatOpen} />
        <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={loadChats} />
        <SendMediaDialog open={mediaDialog.open} onOpenChange={(v) => setMediaDialog((p) => ({ ...p, open: v }))} type={mediaDialog.type} session={selectedSession} chatId={selectedChat.id} onSent={() => { loadMessages(selectedChat.id); loadChats() }} />
      </div>
    </ChatProvider>
  )
}

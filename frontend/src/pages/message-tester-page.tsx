import { useState, useEffect, useRef } from "react"
import type { RefObject } from "react"
import { useParams } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

import { Send, CheckCircle, XCircle, Phone, FileText, Image, Video, Music, File, Upload, Loader2 } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { api, type Session } from "@/lib/api"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { EmptyState, ErrorState, Metric } from "@/components/primitives"
import { mapSessionStatus, type StatusKind } from "@/lib/status"

const SESSION_DOT: Record<StatusKind, string> = {
  working: "bg-success",
  starting: "bg-warning",
  failed: "bg-error",
  stopped: "bg-muted-foreground/60",
}

function FileDropzone({
  accept,
  label,
  fileName,
  onFile,
  inputRef,
}: {
  accept?: string
  label: string
  fileName: string | null
  onFile: (file: File | null) => void
  inputRef: RefObject<HTMLInputElement | null>
}) {
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFile(e.dataTransfer.files?.[0] ?? null)
      }}
    >
      <Upload className="mx-auto mb-2 size-6 text-muted-foreground" strokeWidth={1.75} />
      <p className="text-sm font-medium">{fileName ?? `Upload ${label.toLowerCase()}`}</p>
      <p className="mt-1 text-xs text-muted-foreground">Click to browse or drop a file here</p>
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={`Choose ${label.toLowerCase()} file`}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

export function MessageTesterPage() {
  const { chatId: urlChatId } = useParams()
  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState("")
  const [chatId, setChatId] = useState(urlChatId || "")
  const [text, setText] = useState("")
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<{ success: boolean; messageId?: string; error?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedFileRef = useRef<File | null>(null)

  const loadSessions = () => {
    setSessionsError(null)
    api
      .getSessions()
      .then((list) => {
        setSessions(list)
        if (list.length > 0 && !session) setSession(list[0].name)
      })
      .catch((err: any) => setSessionsError(err?.message || "Could not load sessions"))
  }

  useEffect(() => {
    loadSessions()
  }, [])

  function selectFile(file: File | null) {
    selectedFileRef.current = file
    setFileName(file?.name ?? null)
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file) })
  }

  function getMimeType(type: string): string {
    if (type === "image") return "image/jpeg"
    if (type === "video") return "video/mp4"
    if (type === "audio") return "audio/ogg"
    return "application/octet-stream"
  }

  async function sendMessage(type: string) {
    if (!chatId || (!text && type === "text")) { toast.error("Chat ID and text are required"); return }
    if (!session) { toast.error("No session selected"); return }
    setSending(true); setResult(null)
    try {
      const file = selectedFileRef.current ?? fileInputRef.current?.files?.[0]
      let res: any
      if (type === "text") {
        res = await api.sendText(session, chatId, text)
      } else if (file) {
        const base64 = await fileToBase64(file)
        const fd = { mimetype: file.type || getMimeType(type), filename: file.name, data: base64 }
        if (type === "image") res = await api.sendImage(session, chatId, fd, text)
        else if (type === "video") res = await api.sendVideo(session, chatId, fd, text)
        else if (type === "audio") res = await api.sendVoice(session, chatId, fd)
        else if (type === "document") res = await api.sendFile(session, chatId, fd, text)
      } else {
        toast.error("Please select a file"); setSending(false); return
      }
      setResult({ success: true, messageId: res?.id || "sent" })
      toast.success("Message sent")
    } catch (err: any) {
      setResult({ success: false, error: err.message || "Request failed" })
    }
    setSending(false)
  }

  async function checkNumber() {
    if (!chatId) { toast.error("Enter a phone number"); return }
    if (!session) { toast.error("No session selected"); return }
    try {
      const res = await api.checkNumberStatus(session, chatId)
      toast[res.exists ? "success" : "info"](res.exists ? `${chatId} is on WhatsApp` : `${chatId} is not on WhatsApp`)
    } catch { toast.error("Check failed") }
  }

  const mediaTabs = [
    { value: "text", icon: FileText, label: "Text", accept: undefined },
    { value: "image", icon: Image, label: "Image", accept: "image/*" },
    { value: "video", icon: Video, label: "Video", accept: "video/*" },
    { value: "audio", icon: Music, label: "Audio", accept: "audio/*" },
    { value: "document", icon: File, label: "Doc", accept: undefined },
  ]

  return (
    <PageLayout
      title="Message Tester"
      description="Send test messages to verify your WhatsApp setup"
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: Compose */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Send className="size-4 text-primary" strokeWidth={1.75} />
              Compose message
            </CardTitle>
            <CardDescription>Configure and send a test message.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionsError ? (
              <ErrorState compact title="Could not load sessions" description={sessionsError} onRetry={loadSessions} />
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tester-session">Session</Label>
                  <Select value={session} onValueChange={setSession}>
                    <SelectTrigger id="tester-session">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions.length === 0 ? (
                        <SelectItem value="__no_sessions__" disabled>No sessions available</SelectItem>
                      ) : sessions.map(s => (
                        <SelectItem key={s.name} value={s.name}>
                          <span className="flex items-center gap-2">
                            <span className={cn("size-2 shrink-0 rounded-full", SESSION_DOT[mapSessionStatus(s.status)])} />
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tester-chat-id">Chat ID / phone number</Label>
                  <div className="flex gap-2">
                    <Input
                      id="tester-chat-id"
                      value={chatId}
                      onChange={e => setChatId(e.target.value)}
                      placeholder="+1555555555@c.us"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={checkNumber}
                      title="Check if the number is on WhatsApp"
                      aria-label="Check if the number is on WhatsApp"
                    >
                      <Phone strokeWidth={1.75} />
                    </Button>
                  </div>
                </div>

                <Tabs defaultValue="text">
                  <TabsList className="w-full justify-start overflow-x-auto">
                    {mediaTabs.map(tab => {
                      const Icon = tab.icon
                      return (
                        <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-sm">
                          <Icon className="size-4" strokeWidth={1.75} />
                          {tab.label}
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>

                  {mediaTabs.map(tab => (
                    <TabsContent key={tab.value} value={tab.value} className="space-y-3 pt-3">
                      {tab.value !== "text" && (
                        <FileDropzone
                          accept={tab.accept}
                          label={tab.label}
                          fileName={fileName}
                          onFile={selectFile}
                          inputRef={fileInputRef}
                        />
                      )}
                      {tab.value === "text" && (
                        <Textarea
                          placeholder="Type your message here"
                          value={text}
                          onChange={e => setText(e.target.value)}
                          rows={5}
                          className="min-h-[120px] resize-y"
                        />
                      )}
                      {tab.value !== "text" && tab.value !== "audio" && (
                        <Input
                          aria-label={tab.value === "document" ? "Filename (optional)" : "Caption (optional)"}
                          placeholder={tab.value === "document" ? "Filename (optional)" : "Caption (optional)"}
                          value={text}
                          onChange={e => setText(e.target.value)}
                        />
                      )}
                      <Button
                        onClick={() => sendMessage(tab.value)}
                        disabled={sending}
                        className="w-full"
                      >
                        {sending ? (
                          <Loader2 className="animate-spin" strokeWidth={1.75} />
                        ) : (
                          <Send strokeWidth={1.75} />
                        )}
                        {sending ? "Sending" : `Send ${tab.label.toLowerCase()}`}
                      </Button>
                    </TabsContent>
                  ))}
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Result */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <CheckCircle className="size-4 text-primary" strokeWidth={1.75} />
              Delivery result
            </CardTitle>
            <CardDescription>See the status of your last message.</CardDescription>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className={cn(
                "rounded-lg border p-5",
                result.success
                  ? "border-success-border bg-success-bg/60"
                  : "border-error-border bg-error-bg/60",
              )}>
                <div className="mb-3 flex items-center gap-3">
                  <div className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    result.success ? "bg-success/15 text-success-foreground" : "bg-error/15 text-error-foreground",
                  )}>
                    {result.success ? <CheckCircle className="size-5" strokeWidth={1.75} /> : <XCircle className="size-5" strokeWidth={1.75} />}
                  </div>
                  <div>
                    <p className="text-base font-medium">
                      {result.success ? "Message sent" : "Delivery failed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.success ? "The message was accepted by the session" : "The message could not be sent"}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border/50 pt-3">
                  {result.messageId && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Message ID</span>
                      <Metric className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{result.messageId}</Metric>
                    </div>
                  )}
                  {result.error && (
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Error</span>
                      <span className="text-right font-medium text-error-foreground">{result.error}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Session</span>
                    <Badge variant="secondary" className="flex items-center gap-1.5 font-mono text-xs">
                      <span className={cn("size-1.5 shrink-0 rounded-full", SESSION_DOT[mapSessionStatus(sessions.find(s => s.name === session)?.status)])} />
                      {session}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Send strokeWidth={1.75} />}
                title="No messages sent yet"
                description="Fill in the fields on the left, then send a message."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

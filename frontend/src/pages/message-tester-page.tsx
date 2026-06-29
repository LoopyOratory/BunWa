import { useState, useEffect } from "react"
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

export function MessageTesterPage() {
  const { chatId: urlChatId } = useParams()
  const [sessions, setSessions] = useState<Session[]>([])
  const [session, setSession] = useState("")
  const [chatId, setChatId] = useState(urlChatId || "")
  const [text, setText] = useState("")
  useEffect(() => {
    api.getSessions().then(list => {
      setSessions(list)
      if (list.length > 0 && !session) setSession(list[0].name)
    }).catch(() => {})
  }, [])

  const [sending, setSending] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<{ success: boolean; messageId?: string; error?: string } | null>(null)

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(file) })
  }

  function getMimeType(type: string, _name: string): string {
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
      const fileEl = document.getElementById("media-file") as HTMLInputElement
      const file = fileEl?.files?.[0]
      let res: any
      if (type === "text") {
        res = await api.sendText(session, chatId, text)
      } else if (file) {
        const base64 = await fileToBase64(file)
        const fd = { mimetype: file.type || getMimeType(type, file.name), filename: file.name, data: base64 }
        if (type === "image") res = await api.sendImage(session, chatId, fd, text)
        else if (type === "video") res = await api.sendVideo(session, chatId, fd, text)
        else if (type === "audio") res = await api.sendVoice(session, chatId, fd)
        else if (type === "document") res = await api.sendFile(session, chatId, fd, text)
      } else {
        toast.error("Please select a file"); setSending(false); return
      }
      setResult({ success: true, messageId: res?.id || "sent" })
      toast.success("Message sent!")
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
      toast[res.exists ? "success" : "info"](res.exists ? `${chatId} is on WhatsApp` : `${chatId} is NOT on WhatsApp`)
    } catch (err) { toast.error("Check failed") }
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
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left: Compose */}
          <Card className="relative overflow-hidden">
            {/* Accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-cyan-500 to-teal-500" />
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="size-5 text-primary" />
                Compose Message
              </CardTitle>
              <CardDescription className="text-base">
                Configure and send a test message
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Session Select */}
              <div>
                <Label className="text-sm font-medium">Session</Label>
                <Select value={session} onValueChange={setSession}>
                  <SelectTrigger className="mt-1.5 min-h-[44px] text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.length === 0 ? (
                      <SelectItem value="__no_sessions__" disabled>No sessions available</SelectItem>
                    ) : sessions.map(s => (
                      <SelectItem key={s.name} value={s.name}>
                        <span className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${s.status === "WORKING" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Chat ID */}
              <div>
                <Label className="text-sm font-medium">Chat ID / Phone Number</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    value={chatId}
                    onChange={e => setChatId(e.target.value)}
                    placeholder="+1555555555@c.us"
                    className="flex-1 min-h-[44px] text-base"
                  />
                  <Button
                    variant="outline"
                    onClick={checkNumber}
                    className="min-h-[44px] min-w-[44px]"
                    title="Check if number is on WhatsApp"
                  >
                    <Phone className="size-5" />
                  </Button>
                </div>
              </div>

              {/* Media Type Tabs */}
              <Tabs defaultValue="text">
                <TabsList className="w-full justify-start overflow-x-auto">
                  {mediaTabs.map(tab => {
                    const Icon = tab.icon
                    return (
                      <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-sm">
                        <Icon className="size-4" />
                        {tab.label}
                      </TabsTrigger>
                    )
                  })}
                </TabsList>

                {mediaTabs.map(tab => (
                  <TabsContent key={tab.value} value={tab.value} className="space-y-3 pt-3">
                    {tab.value !== "text" && (
                      <div className="relative">
                        <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer group">
                          <Upload className="size-8 mx-auto mb-2 text-muted-foreground group-hover:text-primary transition-colors" />
                          <p className="text-sm font-medium">{fileName || `Upload ${tab.label}`}</p>
                          <p className="text-xs text-muted-foreground mt-1">Click to browse or drop file here</p>
                          <Input
                            id="media-file"
                            type="file"
                            accept={tab.accept}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              setFileName(file?.name || null)
                            }}
                          />
                        </div>
                        {fileName && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {fileName}
                          </Badge>
                        )}
                      </div>
                    )}
                    {tab.value === "text" && (
                      <Textarea
                        placeholder="Type your message here..."
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={5}
                        className="min-h-[120px] text-base resize-y"
                      />
                    )}
                    {tab.value !== "text" && tab.value !== "audio" && (
                      <Input
                        placeholder={tab.value === "document" ? "Filename (optional)" : "Caption (optional)"}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        className="min-h-[44px] text-base"
                      />
                    )}
                    <Button
                      onClick={() => sendMessage(tab.value)}
                      disabled={sending}
                      className="w-full h-11 text-base"
                    >
                      {sending ? (
                        <Loader2 className="size-5 mr-2 animate-spin" />
                      ) : (
                        <Send className="size-5 mr-2" />
                      )}
                      {sending ? "Sending..." : `Send ${tab.label}`}
                    </Button>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Right: Result */}
          <Card className="relative overflow-hidden">
            {/* Accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="size-5 text-muted-foreground" />
                Delivery Result
              </CardTitle>
              <CardDescription className="text-base">
                See the status of your last message
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className={`p-6 rounded-xl border ${
                  result.success
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-red-500/5 border-red-500/20"
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2.5 rounded-full ${
                      result.success ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                    }`}>
                      {result.success ? <CheckCircle className="size-6" /> : <XCircle className="size-6" />}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {result.success ? "Message Sent" : "Delivery Failed"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {result.success ? "Your message was delivered successfully" : "There was an error sending your message"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-border/50">
                    {result.messageId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Message ID</span>
                        <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{result.messageId}</code>
                      </div>
                    )}
                    {result.error && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Error</span>
                        <span className="text-red-500 font-medium">{result.error}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Session</span>
                      <Badge variant="secondary" className="text-xs font-mono flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${sessions.find(s => s.name === session)?.status === "WORKING" ? "bg-emerald-500" : "bg-zinc-400"}`} />
                        {session}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="p-4 rounded-full bg-muted mx-auto w-fit mb-4">
                    <Send className="size-10 text-muted-foreground/50" />
                  </div>
                  <p className="text-base font-medium text-muted-foreground">
                    No messages sent yet
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Fill in the fields on the left and hit send
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  )
}

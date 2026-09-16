import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, FileText, Eye, Variable, ScrollText, MessageSquare, MousePointerClick, Send, Loader2 } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { api, getApiAuthHeaders, type Session } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  Metric,
} from "@/components/primitives"
import { mapSessionStatus, type StatusKind } from "@/lib/status"

interface Template {
  id: string
  sessionId: string
  name: string
  body: string
  header?: string
  footer?: string
  createdAt: string
  updatedAt: string
}

const SESSION_DOT: Record<StatusKind, string> = {
  working: "bg-success",
  starting: "bg-warning",
  failed: "bg-error",
  stopped: "bg-muted-foreground/60",
}

function authHeaders() {
  return getApiAuthHeaders()
}

export function TemplatesPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState("")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [formData, setFormData] = useState({ name: "", body: "", header: "", footer: "" })
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [chatId, setChatId] = useState("")
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)

  // Both loaders await before touching state, so the initial-load effects never
  // trigger cascading renders.
  const loadSessions = useCallback(async () => {
    try {
      const list = await api.getSessions()
      setSessions(list)
      setSessionsError(null)
      setSelectedSession((current) => current || list[0]?.name || "")
      if (list.length === 0) setLoading(false)
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Could not load sessions")
      setLoading(false)
    }
  }, [])

  const loadTemplates = useCallback(async (session: string) => {
    try {
      const res = await fetch(`/api/sessions/${session}/templates`, { headers: authHeaders() })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      setTemplates(await res.json())
      setError(null)
    } catch (err) {
      setTemplates([])
      setError(err instanceof Error ? err.message : "Could not load templates")
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (!selectedSession) return
    setLoading(true)
    void loadTemplates(selectedSession)
  }, [selectedSession, loadTemplates])

  function openCreate() {
    setFormData({ name: "", body: "", header: "", footer: "" })
    setDialogOpen(true)
  }

  async function saveTemplate() {
    try {
      const res = await fetch(`/api/sessions/${selectedSession}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(formData),
      })
      if (res.ok) { toast.success("Template created"); setDialogOpen(false); void loadTemplates(selectedSession) }
      else { const err = await res.json().catch(() => ({ error: "Save failed" })); toast.error(err.error) }
    } catch { toast.error("Failed to save template") }
  }

  async function deleteTemplate(id: string) {
    try {
      const res = await fetch(`/api/sessions/${selectedSession}/templates/${id}`, { method: "DELETE", headers: authHeaders() })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      toast.success("Template deleted")
      void loadTemplates(selectedSession)
    } catch { toast.error("Failed to delete template") }
  }

  function extractVariables(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/[{}]/g, "")))]
  }

  function openTemplateDialog(template: Template) {
    const values: Record<string, string> = {}
    extractVariables(template.body).forEach(v => { values[v] = "" })
    setVariableValues(values)
    setChatId("")
    setPreviewText(null)
    setDialogError(null)
    setPreviewTemplate(template)
  }

  async function runPreview() {
    if (!previewTemplate) return
    setPreviewLoading(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/sessions/${selectedSession}/templates/${previewTemplate.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ variables: variableValues }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`)
      setPreviewText(typeof data.text === "string" ? data.text : "")
      // The route reads the header, body and footer, so its variable list is
      // authoritative. Merge in any names the local body-only scan missed.
      const names: string[] = Array.isArray(data.variables) ? data.variables : []
      if (names.length > 0) {
        setVariableValues(values => {
          const next = { ...values }
          for (const name of names) if (!(name in next)) next[name] = ""
          return next
        })
      }
    } catch (err) {
      setPreviewText(null)
      setDialogError(err instanceof Error ? err.message : "Could not preview this template")
    } finally {
      setPreviewLoading(false)
    }
  }

  async function sendTemplate() {
    if (!previewTemplate) return
    const target = chatId.trim()
    if (!target) return
    setSendLoading(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/sessions/${selectedSession}/templates/${previewTemplate.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ chatId: target, variables: variableValues }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`)
      toast.success("Template sent")
      setPreviewTemplate(null)
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Could not send this template")
    } finally {
      setSendLoading(false)
    }
  }

  const newTemplateDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button disabled={!selectedSession} onClick={openCreate}>
          <Plus strokeWidth={1.75} />
          New template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Create a reusable message template with variables.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input id="template-name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="welcome-message" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-header">Header (optional)</Label>
            <Input id="template-header" value={formData.header} onChange={e => setFormData({ ...formData, header: e.target.value })} placeholder="Hello {{name}}" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-body">Body</Label>
            <Textarea id="template-body" value={formData.body} onChange={e => setFormData({ ...formData, body: e.target.value })} placeholder="Welcome to our store. You ordered {{product}}." rows={6} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-footer">Footer (optional)</Label>
            <Input id="template-footer" value={formData.footer} onChange={e => setFormData({ ...formData, footer: e.target.value })} placeholder="Reply STOP to unsubscribe" />
          </div>
          {formData.body && extractVariables(formData.body).length > 0 && (
            <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Variable className="size-4" strokeWidth={1.75} />
                Variables detected
              </div>
              <div className="flex flex-wrap gap-1.5">
                {extractVariables(formData.body).map(v => (
                  <Badge key={v} variant="outline" className="font-mono text-xs">{'{{'}{v}{'}}'}</Badge>
                ))}
              </div>
            </div>
          )}
          <Button onClick={saveTemplate} className="w-full">
            <ScrollText strokeWidth={1.75} />
            Create template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  return (
    <PageLayout
      title="Templates"
      description="Create reusable message templates with variables"
      actions={newTemplateDialog}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="template-session" className="shrink-0 text-muted-foreground">Session</Label>
          <Select value={selectedSession} onValueChange={setSelectedSession}>
            <SelectTrigger id="template-session" className="w-full sm:w-72">
              <SelectValue placeholder="Select a session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.length === 0 ? (
                <SelectItem value="__none__" disabled>No sessions available</SelectItem>
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

        {sessionsError ? (
          <ErrorState title="Could not load sessions" description={sessionsError} onRetry={loadSessions} />
        ) : loading ? (
          <CardGridSkeleton count={6} />
        ) : error ? (
          <ErrorState
            title="Could not load templates"
            description={error}
            onRetry={() => void loadTemplates(selectedSession)}
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={<FileText strokeWidth={1.75} />}
            title="No sessions available"
            description="Create a WhatsApp session before adding templates."
          />
        ) : !selectedSession ? (
          <EmptyState
            icon={<MousePointerClick strokeWidth={1.75} />}
            title="Select a session to get started"
            description="Templates belong to a WhatsApp session."
          />
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<FileText strokeWidth={1.75} />}
            title="No templates yet"
            description="Create a reusable message template with dynamic variables."
            action={
              <Button onClick={openCreate}>
                <Plus strokeWidth={1.75} />
                New template
              </Button>
            }
          />
        ) : (
          <div className="card-grid">
            {templates.map(template => {
              const vars = extractVariables(template.body)
              return (
                <Card key={template.id} className="card-hover">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <MessageSquare className="size-5" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base font-medium">{template.name}</CardTitle>
                          <CardDescription className="mt-0.5 text-xs">
                            <Metric>{vars.length}</Metric> variable{vars.length !== 1 ? "s" : ""}
                            {template.header ? ". With header" : ""}
                            {template.footer ? ". With footer" : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-xs">
                        <Metric>{vars.length}</Metric> vars
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-sm text-muted-foreground line-clamp-3">{template.body}</div>
                    <div className="flex items-center gap-2 border-t border-border pt-3">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openTemplateDialog(template)}>
                        <Eye className="size-4" strokeWidth={1.75} />
                        Preview
                      </Button>
                      {vars.length > 0 && (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openTemplateDialog(template)}>
                          <Variable className="size-4" strokeWidth={1.75} />
                          Variables ({vars.length})
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTemplate(template.id)}
                        title="Delete template"
                        aria-label="Delete template"
                      >
                        <Trash2 className="size-4" strokeWidth={1.75} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preview and send: {previewTemplate?.name}</DialogTitle>
              <DialogDescription>
                Fill in the variable values, preview the rendered message and send it to a chat.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {Object.keys(variableValues).length === 0 ? (
                <p className="text-sm text-muted-foreground">This template does not use any variables.</p>
              ) : (
                <div className="max-h-56 space-y-3 overflow-y-auto pe-1">
                  {Object.keys(variableValues).map(name => (
                    <div key={name} className="space-y-1.5">
                      <Label htmlFor={`template-variable-${name}`} className="font-mono text-xs">{name}</Label>
                      <Input
                        id={`template-variable-${name}`}
                        value={variableValues[name]}
                        onChange={e => setVariableValues(values => ({ ...values, [name]: e.target.value }))}
                        placeholder={`Value for ${name}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Button variant="outline" onClick={runPreview} disabled={previewLoading}>
                  {previewLoading ? (
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                  ) : (
                    <Eye strokeWidth={1.75} />
                  )}
                  Preview
                </Button>
                {previewText !== null && (
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    {previewText}
                  </div>
                )}
              </div>

              {dialogError && (
                <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
                  {dialogError}
                </p>
              )}

              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="template-chat-id">Chat ID</Label>
                <Input
                  id="template-chat-id"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="15551234567@c.us"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Cancel</Button>
              <Button
                onClick={sendTemplate}
                disabled={!chatId.trim() || sendLoading}
                title={!chatId.trim() ? "Enter a chat ID to send this message" : undefined}
              >
                {sendLoading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.75} /> : <Send strokeWidth={1.75} />}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  )
}

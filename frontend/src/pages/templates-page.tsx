import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Trash2, FileText, Eye, Variable, ScrollText, MessageSquare } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { getDashboardAuthHeader } from "@/lib/auth"
import { api, type Session } from "@/lib/api"

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

function authHeaders() {
  const auth = getDashboardAuthHeader()
  return { "x-api-key": "waha", ...(auth ? { Authorization: `Basic ${auth}` } : {}) }
}

export function TemplatesPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState("")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null)
  const [formData, setFormData] = useState({ name: "", body: "", header: "", footer: "" })

  useEffect(() => {
    api.getSessions().then(list => {
      setSessions(list)
      if (list.length > 0 && !selectedSession) setSelectedSession(list[0].name)
    }).catch(() => {})
  }, [])

  useEffect(() => { if (selectedSession) loadTemplates() }, [selectedSession])

  async function loadTemplates() {
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/${selectedSession}/templates`, { headers: authHeaders() })
      if (res.ok) setTemplates(await res.json())
    } catch { toast.error("Failed to load templates") }
    setLoading(false)
  }

  async function saveTemplate() {
    try {
      const res = await fetch(`/api/sessions/${selectedSession}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(formData),
      })
      if (res.ok) { toast.success("Template created"); setDialogOpen(false); loadTemplates() }
      else { const err = await res.json().catch(() => ({ error: "Save failed" })); toast.error(err.error) }
    } catch { toast.error("Failed to save template") }
  }

  async function deleteTemplate(id: string) {
    try {
      await fetch(`/api/sessions/${selectedSession}/templates/${id}`, { method: "DELETE", headers: authHeaders() })
      toast.success("Template deleted")
      loadTemplates()
    } catch { toast.error("Failed to delete template") }
  }

  function extractVariables(text: string): string[] {
    const matches = text.match(/\{\{(\w+)\}\}/g) || []
    return [...new Set(matches.map(m => m.replace(/[{}]/g, "")))]
  }

  function renderPreview(template: Template): string {
    const vars: Record<string, string> = {}
    extractVariables(template.body).forEach(v => vars[v] = `[${v}]`)
    let result = ""
    if (template.header) result += template.header.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `{{${k}}}`) + "\n\n"
    result += template.body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `{{${k}}}`)
    if (template.footer) result += "\n\n" + template.footer.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `{{${k}}}`)
    return result
  }

  const newTemplateDialog = (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button disabled={!selectedSession} onClick={() => setFormData({ name: "", body: "", header: "", footer: "" })}>
          <Plus />New Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">New Template</DialogTitle>
          <DialogDescription className="text-base">Create a reusable message template with variables</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Name</Label>
            <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="welcome-message" className="mt-1.5 min-h-[44px]" />
          </div>
          <div>
            <Label className="text-sm font-medium">Header (optional)</Label>
            <Input value={formData.header} onChange={e => setFormData({ ...formData, header: e.target.value })} placeholder="Hello {{name}}!" className="mt-1.5 min-h-[44px]" />
          </div>
          <div>
            <Label className="text-sm font-medium">Body</Label>
            <Textarea value={formData.body} onChange={e => setFormData({ ...formData, body: e.target.value })} placeholder="Welcome to our store! You ordered {{product}}." rows={6} className="mt-1.5 min-h-[120px] text-base" />
          </div>
          <div>
            <Label className="text-sm font-medium">Footer (optional)</Label>
            <Input value={formData.footer} onChange={e => setFormData({ ...formData, footer: e.target.value })} placeholder="Reply STOP to unsubscribe" className="mt-1.5 min-h-[44px]" />
          </div>
          {formData.body && extractVariables(formData.body).length > 0 && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 text-sm font-medium text-primary mb-2">
                <Variable className="size-4" />
                Variables detected
              </div>
              <div className="flex flex-wrap gap-1.5">
                {extractVariables(formData.body).map(v => (
                  <span key={v} className="inline-flex items-center gap-1 text-xs font-mono bg-primary/10 text-primary px-2.5 py-1 rounded-md">{'{{'}{v}{'}}'}</span>
                ))}
              </div>
            </div>
          )}
          <Button onClick={saveTemplate} className="w-full h-11 text-base">
            <ScrollText className="size-5" />Save Template
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
        <div className="flex items-center gap-3">
          <Label className="text-sm font-medium shrink-0">Session</Label>
          <Select value={selectedSession} onValueChange={setSelectedSession}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.length === 0 ? (
                <SelectItem value="__none__" disabled>No sessions available</SelectItem>
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

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-28" />
                <CardContent className="h-20" />
              </Card>
            ))}
          </div>
        ) : !selectedSession ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-xl font-semibold text-muted-foreground">Select a session to get started</p>
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 rounded-full bg-primary/10 mb-6">
                <FileText className="size-12 text-primary" />
              </div>
              <p className="text-xl font-semibold">No templates yet</p>
              <p className="text-base text-muted-foreground mt-1 mb-6">
                Create reusable message templates with dynamic variables
              </p>
              <Button onClick={() => { setFormData({ name: "", body: "", header: "", footer: "" }); setDialogOpen(true) }}>
                <Plus />Create Your First Template
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map(template => {
              const vars = extractVariables(template.body)
              return (
                <Card key={template.id} className="card-hover">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                          <MessageSquare className="size-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base font-semibold truncate">{template.name}</CardTitle>
                          <CardDescription className="text-xs mt-0.5">
                            {vars.length} variable{vars.length !== 1 ? "s" : ""}{template.header ? " — with header" : ""}{template.footer ? " — with footer" : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{vars.length} vars</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm font-mono text-muted-foreground line-clamp-3 bg-muted/30 p-3 rounded-lg whitespace-pre-wrap">{template.body}</div>
                    {vars.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {vars.map(v => (
                          <Badge key={v} variant="outline" className="text-xs font-mono border-violet-500/20 text-violet-600 dark:text-violet-400">
                            <Variable className="size-3 mr-1" />{v}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t">
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setPreviewTemplate(template)}>
                        <Eye className="size-3.5" />Preview
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 ml-auto text-muted-foreground hover:text-destructive" onClick={() => deleteTemplate(template.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-xl">Preview: {previewTemplate?.name}</DialogTitle>
              <DialogDescription className="text-base">Sample rendering with placeholder values</DialogDescription>
            </DialogHeader>
            <div className="min-h-[200px] bg-gradient-to-br from-muted/50 to-muted p-5 rounded-xl border">
              <div className="max-w-[85%] ml-auto">
                <div className="bg-primary text-primary-foreground p-4 rounded-2xl rounded-br-md shadow-sm">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{previewTemplate && renderPreview(previewTemplate)}</p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 text-right">just now</p>
              </div>
            </div>
            {previewTemplate && extractVariables(previewTemplate.body).length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {extractVariables(previewTemplate.body).map(v => (
                  <Badge key={v} variant="secondary" className="text-xs font-mono"><Variable className="size-3 mr-1" />{v}</Badge>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  )
}

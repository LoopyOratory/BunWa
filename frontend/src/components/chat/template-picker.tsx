import { useState } from "react"
import { ArrowLeft, Eye, FileText, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { getApiAuthHeaders } from "@/lib/api"
import { EmptyState, ErrorState, Metric, Skeleton } from "@/components/primitives"

/* ── Types ──────────────────────────────────────────────────────────── */

interface Template {
  id: string
  sessionId: string
  name: string
  body: string
  header?: string | null
  footer?: string | null
  /** Variable names the template needs, as reported by the templates route. */
  variables?: string[]
  createdAt: string
  updatedAt: string
}

interface TemplatePickerProps {
  /** Session whose templates are listed. */
  session: string
  /** Chat currently open in the composer. Sending stays disabled without one. */
  chatId?: string | null
  /** Called after a template is sent, e.g. to refresh the conversation. */
  onSent?: () => void
}

/*
 * The list route reports the variables each template needs, so the picker
 * never has to call preview to discover them. This local scan is only a
 * fallback for a response that predates that field; it reads the header, body
 * and footer in the same order the server composes them.
 */
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{(\w+(?:\.\w+)*)\}\}/g) || []
  return [...new Set(matches.map((m) => m.replace(/[{}]/g, "")))].sort()
}

/* ── TemplatePicker ─────────────────────────────────────────────────── */

export function TemplatePicker({ session, chatId, onSent }: TemplatePickerProps) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Template | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const target = chatId?.trim() || ""

  function resetForm() {
    setSelected(null)
    setVariables({})
    setPreviewText(null)
    setFormError(null)
  }

  async function loadTemplates() {
    if (!session) return
    setLoading(true)
    resetForm()
    try {
      const res = await fetch(`/api/sessions/${session}/templates`, { headers: getApiAuthHeaders() })
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const data = await res.json()
      setTemplates(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setTemplates([])
      setError(err instanceof Error ? err.message : "Could not load templates")
    } finally {
      setLoading(false)
    }
  }

  function openPicker() {
    setOpen(true)
    void loadTemplates()
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm()
  }

  function selectTemplate(template: Template) {
    const names = template.variables ?? extractVariables(
      [template.header, template.body, template.footer].filter(Boolean).join("\n")
    )
    const values: Record<string, string> = {}
    for (const name of names) values[name] = ""
    setVariables(values)
    setSelected(template)
    setPreviewText(null)
    setFormError(null)
  }

  async function runPreview() {
    if (!selected) return
    setPreviewLoading(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/sessions/${session}/templates/${selected.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
        body: JSON.stringify({ variables }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`)
      setPreviewText(typeof data.text === "string" ? data.text : "")
      // The route reads header, body and footer, so merge in any names the
      // fallback scan missed.
      const names: string[] = Array.isArray(data.variables) ? data.variables : []
      if (names.length > 0) {
        setVariables((values) => {
          const next = { ...values }
          for (const name of names) if (!(name in next)) next[name] = ""
          return next
        })
      }
    } catch (err) {
      setPreviewText(null)
      setFormError(err instanceof Error ? err.message : "Could not preview this template")
    } finally {
      setPreviewLoading(false)
    }
  }

  async function sendTemplate() {
    if (!selected || !target) return
    setSendLoading(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/sessions/${session}/templates/${selected.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getApiAuthHeaders() },
        body: JSON.stringify({ chatId: target, variables }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`)
      toast.success("Template sent")
      onSent?.()
      handleOpenChange(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send this template")
    } finally {
      setSendLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-md" onClick={openPicker}>
        <FileText className="size-4" strokeWidth={1.75} />
        Templates
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected ? `Preview and send: ${selected.name}` : "Templates"}</DialogTitle>
            <DialogDescription>
              {selected
                ? "Fill in the variable values, preview the rendered message and send it to the chat that is open."
                : "Pick a template to send to the chat that is open."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto py-2">
            {selected ? (
              <>
                {Object.keys(variables).length === 0 ? (
                  <p className="text-sm text-muted-foreground">This template does not use any variables.</p>
                ) : (
                  <div className="max-h-56 space-y-3 overflow-y-auto pe-1">
                    {Object.keys(variables).map((name) => (
                      <div key={name} className="space-y-1.5">
                        <Label htmlFor={`template-picker-${name}`} className="font-mono text-xs">{name}</Label>
                        <Input
                          id={`template-picker-${name}`}
                          value={variables[name]}
                          onChange={(e) => setVariables((values) => ({ ...values, [name]: e.target.value }))}
                          placeholder={`Value for ${name}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Button variant="outline" onClick={() => void runPreview()} disabled={previewLoading || sendLoading}>
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

                {formError && (
                  <p role="alert" className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error-foreground">
                    {formError}
                  </p>
                )}
              </>
            ) : loading ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <ErrorState
                compact
                title="Could not load templates"
                description={error}
                onRetry={() => void loadTemplates()}
              />
            ) : templates.length === 0 ? (
              <EmptyState
                compact
                icon={<FileText className="size-5" strokeWidth={1.75} />}
                title="No templates yet"
                description="Create a reusable message template on the Templates page, then send it from here."
              />
            ) : (
              <div className="space-y-2">
                {templates.map((template) => {
                  const count = template.variables?.length ?? 0
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template)}
                      className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{template.name}</span>
                        {count > 0 && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            <Metric>{count}</Metric> {count === 1 ? "variable" : "variables"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{template.body}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {selected && (
            <DialogFooter>
              <Button variant="outline" onClick={resetForm} disabled={sendLoading}>
                <ArrowLeft strokeWidth={1.75} />
                Back
              </Button>
              <Button
                onClick={() => void sendTemplate()}
                disabled={!target || sendLoading}
                title={!target ? "Open a chat first to send this template" : undefined}
              >
                {sendLoading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.75} /> : <Send strokeWidth={1.75} />}
                Send to this chat
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

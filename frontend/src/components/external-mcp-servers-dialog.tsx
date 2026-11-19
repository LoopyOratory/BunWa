import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Eye, Pencil, Plus, Power, RefreshCw, Trash2, Wrench } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  agentApi,
  type ExternalMcpServerInfo,
} from "@/lib/agents-api"

function formatDate(value: string | null) {
  if (!value) return "Never"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function ExternalMcpServersDialog({
  open,
  onOpenChange,
  onServersChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onServersChanged?: () => void
}) {
  const [servers, setServers] = useState<ExternalMcpServerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [revealedHeaders, setRevealedHeaders] = useState<{ serverId: string; values: Record<string, string> } | null>(null)
  const [revealingHeadersId, setRevealingHeadersId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [url, setUrl] = useState("")
  const [headers, setHeaders] = useState("")

  const editingServer = editingId ? servers.find((server) => server.id === editingId) ?? null : null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setServers(await agentApi.externalMcpServers())
    } catch {
      toast.error("Could not load external MCP servers")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  const resetForm = () => {
    setEditingId(null)
    setName("")
    setDescription("")
    setUrl("")
    setHeaders("")
  }

  const startEdit = (server: ExternalMcpServerInfo) => {
    setEditingId(server.id)
    setName(server.name)
    setDescription(server.description)
    setUrl(server.url)
    setHeaders("")
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Give the server a name")
      return
    }
    if (!url.trim()) {
      toast.error("Paste the MCP server URL")
      return
    }

    let parsedHeaders: Record<string, string> | undefined
    if (headers.trim()) {
      try {
        const parsed = JSON.parse(headers)
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("Headers must be a JSON object")
          return
        }
        parsedHeaders = parsed as Record<string, string>
      } catch {
        toast.error("Headers must be valid JSON")
        return
      }
    }

    setSaving(true)
    try {
      if (editingId) {
        await agentApi.updateExternalMcpServer(editingId, {
          name: name.trim(),
          description: description.trim(),
          url: url.trim(),
          // Blank means "keep the existing headers". Enter {} to clear them.
          headers: parsedHeaders,
        })
        toast.success("External MCP server updated")
        resetForm()
        await load()
        onServersChanged?.()
      } else {
        const server = await agentApi.createExternalMcpServer({
          name: name.trim(),
          description: description.trim(),
          url: url.trim(),
          headers: parsedHeaders ?? {},
          enabled: true,
        })
        resetForm()
        toast.success("External MCP server added")
        await load()
        onServersChanged?.()
        // Discover tools immediately so the admin sees them without a second click.
        try {
          setRefreshingId(server.id)
          await agentApi.refreshExternalMcpServer(server.id)
          toast.success("Tools imported")
          await load()
          onServersChanged?.()
        } catch {
          toast.error("Could not reach the server to import tools yet")
          await load()
        } finally {
          setRefreshingId(null)
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the server")
    } finally {
      setSaving(false)
    }
  }

  const refresh = async (server: ExternalMcpServerInfo) => {
    setRefreshingId(server.id)
    try {
      await agentApi.refreshExternalMcpServer(server.id)
      toast.success(`Tools refreshed for ${server.name}`)
      await load()
      onServersChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not refresh tools")
      await load()
    } finally {
      setRefreshingId(null)
    }
  }

  const toggle = async (server: ExternalMcpServerInfo) => {
    setTogglingId(server.id)
    try {
      await agentApi.updateExternalMcpServer(server.id, { enabled: !server.enabled })
      toast.success(`${server.name} ${server.enabled ? "disabled" : "enabled"}`)
      await load()
      onServersChanged?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the server")
    } finally {
      setTogglingId(null)
    }
  }

  const revealHeaders = async (server: ExternalMcpServerInfo) => {
    if (revealedHeaders?.serverId === server.id) {
      setRevealedHeaders(null)
      return
    }
    setRevealingHeadersId(server.id)
    try {
      const values = await agentApi.revealExternalMcpServerHeaders(server.id)
      setRevealedHeaders({ serverId: server.id, values })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reveal the headers")
    } finally {
      setRevealingHeadersId(null)
    }
  }

  const remove = async (server: ExternalMcpServerInfo) => {
    if (!window.confirm(`Remove ${server.name}? Its tools will disappear from every agent.`)) return
    try {
      await agentApi.deleteExternalMcpServer(server.id)
      toast.success("External MCP server removed")
      if (editingId === server.id) resetForm()
      if (expandedId === server.id) setExpandedId(null)
      await load()
      onServersChanged?.()
    } catch {
      toast.error("Could not remove the server")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>External MCP servers</DialogTitle>
          <DialogDescription>
            Connect third-party MCP servers. Their tools are cached here, then agents select which ones they may call.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Card className="border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {editingId ? `Edit ${editingServer?.name ?? "server"}` : "Add a server"}
              </CardTitle>
              <CardDescription>
                {editingId
                  ? "Update the connection. Leave headers blank to keep the stored credentials."
                  : "Give it a name and paste the MCP endpoint URL. Tools are imported after saving."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="external-mcp-name">Name</Label>
                  <Input
                    id="external-mcp-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Notion"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="external-mcp-url">MCP URL</Label>
                  <Input
                    id="external-mcp-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://mcp.notion.com/mcp"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="external-mcp-description">Description</Label>
                  <Input
                    id="external-mcp-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Workspace notes and docs"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="external-mcp-headers">Headers (JSON, optional)</Label>
                  <Textarea
                    id="external-mcp-headers"
                    value={headers}
                    onChange={(event) => setHeaders(event.target.value)}
                    placeholder='{"Authorization": "Bearer ..."}'
                    className="min-h-20 font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {editingId && editingServer
                      ? editingServer.headerNames.length > 0
                        ? `Stored headers: ${editingServer.headerNames.join(", ")}. Leave blank to keep them, or enter a JSON object to replace them.`
                        : "No headers stored. Add a JSON object if the server needs auth."
                      : "Stored server-side. Header values are never returned to the browser."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void submit()} disabled={saving}>
                  {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                  {saving ? "Saving…" : editingId ? "Save changes" : "Add server"}
                </Button>
                {editingId && (
                  <Button variant="ghost" onClick={resetForm} disabled={saving}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Connected servers</p>
                <p className="text-xs text-muted-foreground">
                  Disable a server to hide its tools from every agent without deleting it.
                </p>
              </div>
              <Badge variant="outline">{servers.length}</Badge>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[0, 1].map((row) => (
                  <div key={row} className="h-20 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : servers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No external MCP servers yet. Add one above and its tools will show up in the MCP skill picker.
              </p>
            ) : (
              <div className="space-y-3">
                {servers.map((server) => {
                  const expanded = expandedId === server.id
                  return (
                    <Card key={server.id} className="border-border/70 bg-card/70">
                      <CardContent className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{server.name}</p>
                              <Badge variant={server.enabled ? "secondary" : "outline"}>
                                {server.enabled ? "enabled" : "disabled"}
                              </Badge>
                              <Badge variant="outline">{server.toolCount} tools</Badge>
                              {server.headerNames.length > 0 && (
                                <Badge variant="outline" title={server.headerNames.join(", ")}>
                                  {server.headerNames.length} header{server.headerNames.length === 1 ? "" : "s"}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{server.url}</p>
                            {server.description && (
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">{server.description}</p>
                            )}
                            {server.lastError ? (
                              <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                                Last refresh failed: {server.lastError}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                Last refreshed: {formatDate(server.lastRefreshedAt)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedId(expanded ? null : server.id)}
                              aria-expanded={expanded}
                            >
                              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                              <Wrench className="size-4" />
                              Tools
                            </Button>
                            {server.headerNames.length > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void revealHeaders(server)}
                                disabled={revealingHeadersId === server.id}
                              >
                                <Eye className="size-4" />
                                {revealedHeaders?.serverId === server.id ? "Hide keys" : "View keys"}
                              </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={() => startEdit(server)}>
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void toggle(server)}
                              disabled={togglingId === server.id}
                            >
                              <Power className="size-4" />
                              {server.enabled ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void refresh(server)}
                              disabled={refreshingId === server.id || !server.enabled}
                            >
                              <RefreshCw className="size-4" />
                              {refreshingId === server.id ? "Refreshing…" : "Refresh"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void remove(server)}
                              aria-label={`Remove ${server.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>

                        {revealedHeaders?.serverId === server.id && (
                          <div className="mt-3 rounded-xl border border-border/60 bg-background/50 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-medium">Stored headers</p>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setRevealedHeaders(null)}>
                                Hide
                              </Button>
                            </div>
                            <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/60 p-2 font-mono text-[10px] leading-5">
{JSON.stringify(revealedHeaders.values, null, 2)}
                            </pre>
                          </div>
                        )}

                        {expanded && (
                          <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                            {server.tools.length === 0 ? (
                              <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                                No tools cached yet. Refresh this server to import its catalogue.
                              </p>
                            ) : (
                              server.tools.map((tool) => (
                                <div key={tool.id} className="rounded-xl border border-border/60 bg-background/50 p-2.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-medium">{tool.name}</p>
                                    <Badge variant={tool.tier === "read" ? "secondary" : "outline"}>{tool.tier}</Badge>
                                    {tool.destructive && <Badge variant="destructive">destructive</Badge>}
                                    <code className="ml-auto max-w-full truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                      {tool.qualifiedName}
                                    </code>
                                  </div>
                                  {tool.description && (
                                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{tool.description}</p>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

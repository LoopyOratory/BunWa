import { useCallback, useEffect, useState } from "react"
import { Plus, RefreshCw, Trash2 } from "lucide-react"
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
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [url, setUrl] = useState("")
  const [headers, setHeaders] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await agentApi.externalMcpServers()
      setServers(list)
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
    setName("")
    setDescription("")
    setUrl("")
    setHeaders("")
  }

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give the server a name")
      return
    }
    if (!url.trim()) {
      toast.error("Paste the MCP server URL")
      return
    }
    let parsedHeaders: Record<string, string> = {}
    if (headers.trim()) {
      try {
        const parsed = JSON.parse(headers)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsedHeaders = parsed as Record<string, string>
        } else {
          toast.error("Headers must be a JSON object")
          return
        }
      } catch {
        toast.error("Headers must be valid JSON")
        return
      }
    }

    setSaving(true)
    try {
      const server = await agentApi.createExternalMcpServer({
        name: name.trim(),
        description: description.trim(),
        url: url.trim(),
        headers: parsedHeaders,
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
      } finally {
        setRefreshingId(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the server")
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
    } finally {
      setRefreshingId(null)
    }
  }

  const remove = async (server: ExternalMcpServerInfo) => {
    try {
      await agentApi.deleteExternalMcpServer(server.id)
      toast.success("External MCP server removed")
      await load()
      onServersChanged?.()
    } catch {
      toast.error("Could not remove the server")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>External MCP servers</DialogTitle>
          <DialogDescription>
            Connect third-party MCP servers. Their tools appear in the MCP skill picker so agents can call them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Card className="border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Add a server</CardTitle>
              <CardDescription>Give it a name and paste the MCP endpoint URL.</CardDescription>
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
                    className="min-h-20"
                  />
                </div>
              </div>
              <Button onClick={create} disabled={saving}>
                <Plus className="size-4" />
                {saving ? "Adding…" : "Add server"}
              </Button>
            </CardContent>
          </Card>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Connected servers</p>
              <Badge variant="outline">{servers.length}</Badge>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[0, 1].map((row) => (
                  <div key={row} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : servers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No external MCP servers yet. Add one above and its tools will show up in the MCP skill picker.
              </p>
            ) : (
              <div className="space-y-3">
                {servers.map((server) => (
                  <Card key={server.id} className="border-border/70 bg-card/70">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{server.name}</p>
                          <Badge variant={server.enabled ? "secondary" : "outline"}>
                            {server.enabled ? "enabled" : "disabled"}
                          </Badge>
                          <Badge variant="outline">{server.toolCount} tools</Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{server.url}</p>
                        {server.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground/80">{server.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void refresh(server)}
                          disabled={refreshingId === server.id}
                        >
                          <RefreshCw className="size-4" />
                          {refreshingId === server.id ? "Refreshing…" : "Refresh"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void remove(server)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
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

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  MessageCircle,
  Plus,
  Trash2,
  Pencil,
  Cpu,
  Plug,
} from "lucide-react"
import { api, type Session } from "@/lib/api"
import { Topbar } from "@/components/topbar"
import { toast } from "sonner"

interface ChatwootApp {
  id: string
  session: string
  app: "chatwoot"
  enabled: boolean
  config: {
    url: string
    accountId: number
    accountToken: string
    inboxId: number
    inboxIdentifier?: string
    locale?: string
    commands?: { server?: boolean; queue?: boolean }
    conversations?: { sort?: string; status?: string[] }
    templates?: Record<string, string>
  }
}

const APP_ICONS: Record<string, any> = {
  chatwoot: MessageCircle,
}

const APP_COLORS: Record<string, string> = {
  chatwoot: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
}

function AppCard({ app, onEdit, onDelete }: { app: ChatwootApp; onEdit: () => void; onDelete: () => void }) {
  const Icon = APP_ICONS[app.app] || Plug
  return (
    <Card className={app.enabled ? "" : "opacity-60"}>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className={`flex size-10 items-center justify-center rounded-lg ${APP_COLORS[app.app] || "bg-muted"}`}>
            <Icon className="size-5" />
          </div>
          <div>
            <CardTitle className="text-sm capitalize">{app.app}</CardTitle>
            <CardDescription className="text-xs">Session: {app.session}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {app.enabled ? (
            <Badge variant="default" className="bg-green-600 text-[10px]">Active</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Disabled</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>URL: {app.config.url}</p>
          <p>Account ID: {app.config.accountId}</p>
          <p>Inbox ID: {app.config.inboxId}</p>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5 mr-1" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="size-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ChatwootConfigForm({
  value,
  onChange,
  sessions,
}: {
  value: {
    session: string
    enabled: boolean
    config: Partial<ChatwootApp["config"]>
  }
  onChange: (updates: any) => void
  sessions: Session[]
}) {
  const { session, enabled, config } = value
  const set = (u: any) => onChange(u)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>WhatsApp Session</Label>
          <Select
            value={session || ""}
            onValueChange={(v) => set({ session: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select session..." />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  {s.name} ({s.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Enabled</Label>
          <div className="flex items-center gap-2 pt-2">
            <Switch
              checked={enabled ?? true}
              onCheckedChange={(v) => set({ enabled: v })}
            />
            <span className="text-sm text-muted-foreground">
              {enabled !== false ? "Active" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Chatwoot URL *</Label>
        <Input
          placeholder="http://chatwoot:3000"
          value={config?.url || ""}
          onChange={(e) => set({ config: { ...config, url: e.target.value } })}
        />
        <p className="text-[10px] text-muted-foreground">Full URL to your Chatwoot instance</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Account ID *</Label>
          <Input
            type="number"
            placeholder="1"
            value={config?.accountId || ""}
            onChange={(e) =>
              set({ config: { ...config, accountId: parseInt(e.target.value) || 0 } })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Account Token *</Label>
          <Input
            placeholder="CHATWOOT_ACCOUNT_TOKEN"
            value={config?.accountToken || ""}
            onChange={(e) =>
              set({ config: { ...config, accountToken: e.target.value } })
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Inbox ID *</Label>
          <Input
            type="number"
            placeholder="1"
            value={config?.inboxId || ""}
            onChange={(e) =>
              set({ config: { ...config, inboxId: parseInt(e.target.value) || 0 } })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Inbox Identifier</Label>
          <Input
            placeholder="Inbox UUID (optional)"
            value={config?.inboxIdentifier || ""}
            onChange={(e) =>
              set({ config: { ...config, inboxIdentifier: e.target.value } })
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Locale</Label>
          <Select
            value={config?.locale || "en-US"}
            onValueChange={(v) => set({ config: { ...config, locale: v } })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en-US">English (US)</SelectItem>
              <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="id">Bahasa Indonesia</SelectItem>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="de">Deutsch</SelectItem>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Conversation Sort</Label>
          <Select
            value={config?.conversations?.sort || "created_newest"}
            onValueChange={(v) =>
              set({
                config: {
                  ...config,
                  conversations: { ...config?.conversations, sort: v },
                },
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_newest">Created: Newest</SelectItem>
              <SelectItem value="activity_newest">Activity: Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

export function AppsPage() {
  const [apps, setApps] = useState<ChatwootApp[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ChatwootApp | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{
    session: string
    enabled: boolean
    config: Partial<ChatwootApp["config"]>
  }>({
    session: "",
    enabled: true,
    config: {
      url: "",
      accountId: 1,
      accountToken: "",
      inboxId: 1,
      inboxIdentifier: "",
      locale: "en-US",
      conversations: { sort: "created_newest", status: ["open", "pending", "snoozed"] },
    },
  })

  const load = async () => {
    try {
      const [appList, sessionList] = await Promise.all([api.getApps(), api.getSessions()])
      setApps(appList)
      setSessions(sessionList)
    } catch (err: any) {
      toast.error("Failed to load apps: " + (err.message || "Unknown error"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!form.session || !form.config?.url || !form.config?.accountToken) {
      toast.error("Session, URL, and Account Token are required")
      return
    }
    try {
      await api.createApp({
        session: form.session,
        app: "chatwoot",
        enabled: form.enabled !== false,
        config: form.config,
      })
      toast.success("Chatwoot integration created")
      setCreating(false)
      resetForm()
      load()
    } catch (err: any) {
      toast.error("Failed to create: " + (err.message || "Unknown error"))
    }
  }

  const handleUpdate = async () => {
    if (!editing) return
    try {
      await api.updateApp(editing.id, {
        session: form.session,
        enabled: form.enabled !== false,
        config: form.config,
      })
      toast.success("Chatwoot integration updated")
      setEditing(null)
      resetForm()
      load()
    } catch (err: any) {
      toast.error("Failed to update: " + (err.message || "Unknown error"))
    }
  }

  const handleDelete = async (app: ChatwootApp) => {
    try {
      await api.deleteApp(app.id)
      toast.success("App deleted")
      load()
    } catch (err: any) {
      toast.error("Failed to delete: " + (err.message || "Unknown error"))
    }
  }

  const resetForm = () => {
    setForm({
      session: "",
      enabled: true,
      config: {
        url: "",
        accountId: 1,
        accountToken: "",
        inboxId: 1,
        inboxIdentifier: "",
        locale: "en-US",
        conversations: { sort: "created_newest", status: ["open", "pending", "snoozed"] },
      },
    })
  }

  const openEdit = (app: ChatwootApp) => {
    setEditing(app)
    setForm({
      session: app.session,
      enabled: app.enabled,
      config: app.config,
    })
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Apps & Integrations" onRefresh={load} />
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        <div className="space-y-4 sm:space-y-6 max-w-4xl">
          {/* Overview */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Apps</CardTitle>
                <Plug className="size-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{apps.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active</CardTitle>
                <Cpu className="size-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">
                  {apps.filter((a) => a.enabled).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Chatwoot</CardTitle>
                <MessageCircle className="size-5 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {apps.filter((a) => a.app === "chatwoot").length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chatwoot Integration Card */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="size-5" />
                  Chatwoot Integration
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Connect WhatsApp with Chatwoot. WhatsApp messages appear as conversations in Chatwoot; agent replies are sent back to WhatsApp.
                </CardDescription>
              </div>
              <Button onClick={() => { resetForm(); setCreating(true); }}>
                <Plus className="size-4 mr-1" />
                Add Integration
              </Button>
            </CardHeader>
          </Card>

          {/* Existing Apps */}
          {apps.length === 0 && !loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Plug className="size-12 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No integrations configured yet.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Click "Add Integration" to connect WAHA with Chatwoot.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onEdit={() => openEdit(app)}
                onDelete={() => handleDelete(app)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={(open) => { setCreating(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Chatwoot Integration</DialogTitle>
            <DialogDescription>
              Configure the connection between WAHA and your Chatwoot instance.
            </DialogDescription>
          </DialogHeader>
          <ChatwootConfigForm value={form} onChange={(u) => setForm((f) => ({ ...f, ...u }))} sessions={sessions} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreating(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate}>Create Integration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Chatwoot Integration</DialogTitle>
            <DialogDescription>
              Update the connection settings for this integration.
            </DialogDescription>
          </DialogHeader>
          <ChatwootConfigForm value={form} onChange={(u) => setForm((f) => ({ ...f, ...u }))} sessions={sessions} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleUpdate}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

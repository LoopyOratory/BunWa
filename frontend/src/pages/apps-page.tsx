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
  Webhook,
  Bot,
  Globe,
  Activity,
} from "lucide-react"
import { api, type Session } from "@/lib/api"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"

/* ── Types ── */

interface AppConfig {
  url?: string
  accountId?: number
  accountToken?: string
  inboxId?: number
  inboxIdentifier?: string
  locale?: string
  commands?: { server?: boolean; queue?: boolean }
  conversations?: { sort?: string; status?: string[] }
  templates?: Record<string, string>
  webhookUrl?: string
  [key: string]: any
}

interface App {
  id: string
  session?: string
  name?: string
  app: string
  enabled: boolean
  config: AppConfig
  createdAt?: string
  updatedAt?: string
  lastActivityAt?: string
}

type AppType = { value: string; label: string; icon: typeof Plug; color: string; description: string }

/* ── App Type Registry ── */

const APP_TYPES: AppType[] = [
  {
    value: "chatwoot",
    label: "Chatwoot Webhook",
    icon: MessageCircle,
    color: "emerald",
    description: "Bridge WhatsApp conversations with Chatwoot CRM",
  },
  {
    value: "custom_webhook",
    label: "Custom Webhook",
    icon: Webhook,
    color: "blue",
    description: "Forward events to any HTTP endpoint",
  },
  {
    value: "bot",
    label: "Chatbot",
    icon: Bot,
    color: "purple",
    description: "Automated reply bot for WhatsApp messages",
  },
]

const APP_TYPE_MAP: Record<string, AppType> = Object.fromEntries(
  APP_TYPES.map((t) => [t.value, t]),
)

const FALLBACK_TYPE: AppType = {
  value: "unknown",
  label: "Integration",
  icon: Plug,
  color: "slate",
  description: "Third-party integration",
}

/* ── Color / styling helpers ── */

const COLOR_ACCENT: Record<string, string> = {
  emerald: "from-emerald-400 to-emerald-600",
  blue: "from-blue-400 to-blue-600",
  purple: "from-purple-400 to-purple-600",
  slate: "from-slate-400 to-slate-600",
}

const COLOR_BG: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
  slate: "bg-muted text-muted-foreground",
}

/* ── Sub-components ── */

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge variant="default" className="bg-emerald-600/90 hover:bg-emerald-600 text-white gap-1.5 px-3 py-1 text-xs font-medium">
      <span className="size-1.5 rounded-full bg-white animate-pulse" />
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-muted-foreground gap-1.5 px-3 py-1 text-xs font-medium">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
      Inactive
    </Badge>
  )
}

function AppCard({
  app,
  onEdit,
  onDelete,
  onToggle,
}: {
  app: App
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
}) {
  const typeInfo = APP_TYPE_MAP[app.app] || FALLBACK_TYPE
  const Icon = typeInfo.icon
  const color = typeInfo.color
  const gradient = COLOR_ACCENT[color] || COLOR_ACCENT.slate
  const iconBg = COLOR_BG[color] || COLOR_BG.slate
  const displayName = app.name || typeInfo.label
  const sessionLabel = app.session ? `Session: ${app.session}` : null
  const url = app.config?.url || app.config?.webhookUrl || null

  return (
    <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5">
      {/* Gradient accent bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          app.enabled
            ? `bg-gradient-to-r ${gradient}`
            : "bg-gradient-to-r from-muted-foreground/30 to-muted-foreground/10"
        }`}
      />

      <CardHeader className="pb-3 pt-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`p-3 rounded-xl ${app.enabled ? iconBg : "bg-muted text-muted-foreground"}`}>
              <Icon className="size-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base font-semibold capitalize leading-tight truncate max-w-[200px]">
                {displayName}
              </CardTitle>
              {sessionLabel && (
                <CardDescription className="text-xs flex items-center gap-1">
                  <Cpu className="size-3 shrink-0" />
                  <span className="truncate">{sessionLabel}</span>
                </CardDescription>
              )}
            </div>
          </div>
          <StatusBadge enabled={app.enabled} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Description / URL */}
        {url ? (
          <p className="text-xs text-muted-foreground font-mono truncate" title={url}>
            <Globe className="size-3 inline mr-1.5 -mt-0.5" />
            {url}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{typeInfo.description}</p>
        )}

        {/* Last activity */}
        {app.lastActivityAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="size-3.5" />
            <span>
              Last activity{" "}
              {(() => {
                const diff = Date.now() - new Date(app.lastActivityAt!).getTime()
                const mins = Math.floor(diff / 60000)
                if (mins < 1) return "just now"
                if (mins < 60) return `${mins}m ago`
                const hours = Math.floor(mins / 60)
                if (hours < 24) return `${hours}h ago`
                const days = Math.floor(hours / 24)
                return `${days}d ago`
              })()}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5"
            onClick={() => onToggle(!app.enabled)}
          >
            <Activity className="size-3.5" />
            {app.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1.5 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── Stats row ── */

function StatsCards({ apps }: { apps: App[] }) {
  const total = apps.length
  const active = apps.filter((a) => a.enabled).length
  const byType = APP_TYPES.map((t) => ({
    ...t,
    count: apps.filter((a) => a.app === t.value).length,
  }))

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Apps</CardTitle>
          <Plug className="size-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold tracking-tight">{total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active</CardTitle>
          <Activity className="size-5 text-emerald-500" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold tracking-tight text-emerald-500">{active}</div>
        </CardContent>
      </Card>
      {byType.map((t) => (
        <Card key={t.value}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t.label}</CardTitle>
            <t.icon className={`size-5 text-${t.color}-500`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight">{t.count}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ── App config form (multi-type) ── */

function AppConfigForm({
  value,
  onChange,
  sessions,
}: {
  value: {
    name: string
    app: string
    session: string
    enabled: boolean
    config: AppConfig
  }
  onChange: (updates: Partial<typeof value>) => void
  sessions: Session[]
}) {
  const { name, app, session, enabled, config } = value
  const set = (u: Partial<typeof value>) => onChange(u)
  const selectedType = APP_TYPE_MAP[app] || FALLBACK_TYPE

  return (
    <div className="space-y-5">
      {/* App type selector */}
      <div className="space-y-2">
        <Label>Integration Type</Label>
        <Select value={app} onValueChange={(v) => set({ app: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select type..." />
          </SelectTrigger>
          <SelectContent>
            {APP_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <div className="flex items-center gap-2">
                  <t.icon className="size-4" />
                  <span>{t.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label>Display Name</Label>
        <Input
          placeholder="My integration"
          value={name || ""}
          onChange={(e) => set({ name: e.target.value })}
        />
        <p className="text-[10px] text-base text-muted-foreground">Optional friendly name for this integration</p>
      </div>

      {/* Session and toggle */}
      <div className="card-grid">
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
            <span className="text-sm text-base text-muted-foreground">
              {enabled !== false ? "Active" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {/* Chatwoot-specific fields */}
      {app === "chatwoot" && (
        <>
          <div className="space-y-2">
            <Label>Chatwoot URL *</Label>
            <Input
              placeholder="http://chatwoot:3000"
              value={config?.url || ""}
              onChange={(e) => set({ config: { ...config, url: e.target.value } })}
            />
            <p className="text-[10px] text-base text-muted-foreground">Full URL to your Chatwoot instance</p>
          </div>

          <div className="card-grid">
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

          <div className="card-grid">
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

          <div className="card-grid">
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
        </>
      )}

      {/* Custom webhook fields */}
      {app === "custom_webhook" && (
        <div className="space-y-2">
          <Label>Webhook URL *</Label>
          <Input
            placeholder="https://your-server.com/webhook"
            value={config?.webhookUrl || ""}
            onChange={(e) => set({ config: { ...config, webhookUrl: e.target.value } })}
          />
          <p className="text-[10px] text-base text-muted-foreground">HTTP endpoint that will receive events</p>
        </div>
      )}

      {/* Bot fields */}
      {app === "bot" && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Webhook URL *</Label>
            <Input
              placeholder="https://your-bot-server.com/webhook"
              value={config?.webhookUrl || ""}
              onChange={(e) => set({ config: { ...config, webhookUrl: e.target.value } })}
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Bot className="size-3.5" />
            Bot processes incoming messages and sends automated replies
          </p>
        </div>
      )}

      {/* Selected type hint */}
      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <selectedType.icon className="size-4 shrink-0 mt-0.5" />
        <span>{selectedType.description}</span>
      </div>
    </div>
  )
}

/* ── Empty state ── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-8">
        <div className="p-4 rounded-full bg-primary/10 mb-6">
          <Plug className="size-12 text-primary" />
        </div>
        <p className="text-xl font-semibold">No apps configured</p>
        <p className="text-base text-muted-foreground mt-1 mb-6">
          Add an integration to connect BunWa with external services
        </p>
        <Button onClick={onAdd}>
          <Plus className="size-5 mr-2" />Create Your First App
        </Button>
      </CardContent>
    </Card>
  )
}

/* ── Main component ── */

const DEFAULT_FORM = {
  name: "",
  app: "chatwoot",
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
    webhookUrl: "",
  } as AppConfig,
}

export function AppsPage() {
  const [apps, setApps] = useState<App[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<App | null>(null)
  const [form, setForm] = useState<typeof DEFAULT_FORM>({ ...DEFAULT_FORM, config: { ...DEFAULT_FORM.config } })

  const load = async () => {
    try {
      const [appList, sessionList] = await Promise.all([api.getApps(), api.getSessions()])
      setApps((appList || []) as App[])
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

  const resetForm = () => {
    setForm({ ...DEFAULT_FORM, config: { ...DEFAULT_FORM.config } })
  }

  const openCreate = () => {
    resetForm()
    setCreating(true)
  }

  const openEdit = (app: App) => {
    const appType = APP_TYPE_MAP[app.app] ? app.app : "chatwoot"
    setEditing(app)
    setForm({
      name: app.name || "",
      app: appType,
      session: app.session || "",
      enabled: app.enabled,
      config: { ...DEFAULT_FORM.config, ...app.config },
    })
  }

  const handleCreate = async () => {
    const typeInfo = APP_TYPE_MAP[form.app]
    if (!form.session) {
      toast.error("A WhatsApp session is required")
      return
    }
    if (form.app === "chatwoot") {
      if (!form.config?.url || !form.config?.accountToken) {
        toast.error("URL and Account Token are required for Chatwoot")
        return
      }
    }
    if ((form.app === "custom_webhook" || form.app === "bot") && !form.config?.webhookUrl) {
      toast.error("Webhook URL is required")
      return
    }
    try {
      await api.createApp({
        session: form.session,
        app: form.app,
        name: form.name || undefined,
        enabled: form.enabled !== false,
        config: form.config,
      })
      toast.success(`${typeInfo?.label || "App"} created`)
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
        name: form.name || undefined,
        enabled: form.enabled !== false,
        config: form.config,
      })
      toast.success("Integration updated")
      setEditing(null)
      resetForm()
      load()
    } catch (err: any) {
      toast.error("Failed to update: " + (err.message || "Unknown error"))
    }
  }

  const handleDelete = async (app: App) => {
    try {
      await api.deleteApp(app.id)
      toast.success("App deleted")
      load()
    } catch (err: any) {
      toast.error("Failed to delete: " + (err.message || "Unknown error"))
    }
  }

  const handleToggle = async (app: App, enabled: boolean) => {
    try {
      await api.updateApp(app.id, { enabled })
      toast.success(enabled ? "App enabled" : "App disabled")
      load()
    } catch (err: any) {
      toast.error("Failed to toggle: " + (err.message || "Unknown error"))
    }
  }

  /* ── Create / Edit dialog ── */
  const appDialog = (
    <Dialog
      open={creating || !!editing}
      onOpenChange={(open) => {
        if (!open) {
          setCreating(false)
          setEditing(null)
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {editing ? "Edit Integration" : "New Integration"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {editing
              ? "Update the connection settings for this integration."
              : "Configure a new app integration to connect BunWa with external services."}
          </DialogDescription>
        </DialogHeader>
        <AppConfigForm
          value={form}
          onChange={(u) => setForm((f) => ({ ...f, ...u }))}
          sessions={sessions}
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setCreating(false)
              setEditing(null)
              resetForm()
            }}
          >
            Cancel
          </Button>
          <Button onClick={editing ? handleUpdate : handleCreate}>
            {editing ? "Save Changes" : "Create Integration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return (
    <PageLayout
      title="Apps"
      description="Manage integrated applications and webhooks"
      actions={
        <>
          {appDialog}
          <Button onClick={openCreate}>
            <Plus className="size-5 mr-2" />Add App
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Stats cards */}
        {apps.length > 0 && <StatsCards apps={apps} />}

        {/* Loading skeleton */}
        {loading ? (
          <div className="card-grid">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="h-32" />
                <CardContent className="h-24" />
              </Card>
            ))}
          </div>
        ) : apps.length === 0 ? (
          <EmptyState onAdd={openCreate} />
        ) : (
          <div className="card-grid">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onEdit={() => openEdit(app)}
                onDelete={() => handleDelete(app)}
                onToggle={(enabled) => handleToggle(app, enabled)}
              />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
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
  Power,
} from "lucide-react"
import { api, type Session } from "@/lib/api"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  StatusBadge,
  Metric,
  StatCard,
  StatRowSkeleton,
  CardGridSkeleton,
  EmptyState,
  ErrorState,
  SectionHeading,
} from "@/components/primitives"

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

type AppType = { value: string; label: string; icon: typeof Plug; description: string }

/* ── App Type Registry ── */

const APP_TYPES: AppType[] = [
  {
    value: "chatwoot",
    label: "Chatwoot Webhook",
    icon: MessageCircle,
    description: "Bridge WhatsApp conversations with Chatwoot CRM",
  },
  {
    value: "custom_webhook",
    label: "Custom Webhook",
    icon: Webhook,
    description: "Forward events to any HTTP endpoint",
  },
  {
    value: "bot",
    label: "Chatbot",
    icon: Bot,
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
  description: "Third-party integration",
}

/* ── Helpers ── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/* ── Sub-components ── */

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
  const displayName = app.name || typeInfo.label
  const sessionLabel = app.session ? `Session: ${app.session}` : null
  const url = app.config?.url || app.config?.webhookUrl || null

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-lg",
                app.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 space-y-1">
              <CardTitle className="truncate text-base font-medium leading-tight">{displayName}</CardTitle>
              {sessionLabel && (
                <CardDescription className="flex items-center gap-1 truncate text-xs">
                  <Cpu className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{sessionLabel}</span>
                </CardDescription>
              )}
            </div>
          </div>
          <StatusBadge kind={app.enabled ? "working" : "stopped"} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {url ? (
          <p className="truncate font-mono text-xs text-muted-foreground" title={url}>
            <Globe className="mr-1.5 -mt-0.5 inline size-3.5" strokeWidth={1.75} />
            {url}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{typeInfo.description}</p>
        )}

        {app.lastActivityAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="size-3.5" strokeWidth={1.75} />
            <span>
              Last activity <Metric>{timeAgo(app.lastActivityAt)}</Metric>
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
            <Pencil className="size-4" strokeWidth={1.75} />
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onToggle(!app.enabled)}>
            <Power className="size-4" strokeWidth={1.75} />
            {app.enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Delete app"
            aria-label="Delete app"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total apps"
        value={<Metric>{total}</Metric>}
        icon={<Plug strokeWidth={1.75} />}
      />
      <StatCard
        label="Active"
        value={<Metric>{active}</Metric>}
        tone="success"
        icon={<Activity strokeWidth={1.75} />}
      />
      {byType.map((t) => (
        <StatCard
          key={t.value}
          label={t.label}
          value={<Metric>{t.count}</Metric>}
          icon={<t.icon strokeWidth={1.75} />}
        />
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
      <div className="space-y-2">
        <Label htmlFor="app-type">Integration type</Label>
        <Select value={app} onValueChange={(v) => set({ app: v })}>
          <SelectTrigger id="app-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {APP_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-2">
                  <t.icon className="size-4" strokeWidth={1.75} />
                  <span>{t.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="app-name">Display name</Label>
        <Input
          id="app-name"
          placeholder="My integration"
          value={name || ""}
          onChange={(e) => set({ name: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">Optional friendly name for this integration.</p>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="app-session">WhatsApp session</Label>
          <Select value={session || ""} onValueChange={(v) => set({ session: v })}>
            <SelectTrigger id="app-session">
              <SelectValue placeholder="Select session" />
            </SelectTrigger>
            <SelectContent>
              {sessions.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No sessions available
                </SelectItem>
              ) : (
                sessions.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    <Metric>{s.name}</Metric>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-enabled">Enabled</Label>
          <div className="flex items-center gap-2 pt-1">
            <Switch
              id="app-enabled"
              checked={enabled ?? true}
              onCheckedChange={(v) => set({ enabled: v })}
            />
            <span className="text-sm text-muted-foreground">
              {enabled !== false ? "Active" : "Disabled"}
            </span>
          </div>
        </div>
      </div>

      {app === "chatwoot" && (
        <>
          <Separator />
          <SectionHeading
            title="Chatwoot connection"
            description="Credentials for your Chatwoot installation."
          />
          <div className="space-y-2">
            <Label htmlFor="chatwoot-url">Chatwoot URL</Label>
            <Input
              id="chatwoot-url"
              placeholder="http://chatwoot:3000"
              value={config?.url || ""}
              onChange={(e) => set({ config: { ...config, url: e.target.value } })}
            />
            <p className="text-xs text-muted-foreground">Full URL to your Chatwoot instance.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chatwoot-account-id">Account ID</Label>
              <Input
                id="chatwoot-account-id"
                type="number"
                placeholder="1"
                className="metric"
                value={config?.accountId || ""}
                onChange={(e) =>
                  set({ config: { ...config, accountId: parseInt(e.target.value) || 0 } })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatwoot-account-token">Account token</Label>
              <Input
                id="chatwoot-account-token"
                placeholder="CHATWOOT_ACCOUNT_TOKEN"
                value={config?.accountToken || ""}
                onChange={(e) =>
                  set({ config: { ...config, accountToken: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chatwoot-inbox-id">Inbox ID</Label>
              <Input
                id="chatwoot-inbox-id"
                type="number"
                placeholder="1"
                className="metric"
                value={config?.inboxId || ""}
                onChange={(e) =>
                  set({ config: { ...config, inboxId: parseInt(e.target.value) || 0 } })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatwoot-inbox-identifier">Inbox identifier</Label>
              <Input
                id="chatwoot-inbox-identifier"
                placeholder="Inbox UUID (optional)"
                value={config?.inboxIdentifier || ""}
                onChange={(e) =>
                  set({ config: { ...config, inboxIdentifier: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="chatwoot-locale">Locale</Label>
              <Select
                value={config?.locale || "en-US"}
                onValueChange={(v) => set({ config: { ...config, locale: v } })}
              >
                <SelectTrigger id="chatwoot-locale">
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
              <Label htmlFor="chatwoot-sort">Conversation sort</Label>
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
                <SelectTrigger id="chatwoot-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_newest">Created: newest</SelectItem>
                  <SelectItem value="activity_newest">Activity: newest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      {app === "custom_webhook" && (
        <>
          <Separator />
          <SectionHeading
            title="Webhook endpoint"
            description="Where BunWa delivers events."
          />
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://your-server.com/webhook"
              value={config?.webhookUrl || ""}
              onChange={(e) => set({ config: { ...config, webhookUrl: e.target.value } })}
            />
            <p className="text-xs text-muted-foreground">HTTP endpoint that will receive events.</p>
          </div>
        </>
      )}

      {app === "bot" && (
        <>
          <Separator />
          <SectionHeading title="Bot endpoint" description="Where BunWa forwards incoming messages." />
          <div className="space-y-2">
            <Label htmlFor="bot-webhook-url">Webhook URL</Label>
            <Input
              id="bot-webhook-url"
              placeholder="https://your-bot-server.com/webhook"
              value={config?.webhookUrl || ""}
              onChange={(e) => set({ config: { ...config, webhookUrl: e.target.value } })}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="size-3.5" strokeWidth={1.75} />
              The bot processes incoming messages and sends automated replies.
            </p>
          </div>
        </>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <selectedType.icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <span>{selectedType.description}</span>
      </div>
    </div>
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
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<App | null>(null)
  const [form, setForm] = useState<typeof DEFAULT_FORM>({ ...DEFAULT_FORM, config: { ...DEFAULT_FORM.config } })

  const load = async () => {
    setError(null)
    if (apps.length === 0) setLoading(true)
    try {
      const [appList, sessionList] = await Promise.all([api.getApps(), api.getSessions()])
      setApps((appList || []) as App[])
      setSessions(sessionList)
    } catch (err: any) {
      setError(err?.message || "Could not load apps")
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
        toast.error("URL and account token are required for Chatwoot")
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
      toast.success("App updated")
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
          <DialogTitle>{editing ? "Edit app" : "New app"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the connection settings for this app."
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
            {editing ? "Save changes" : "Create app"}
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
            <Plus strokeWidth={1.75} />
            New app
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <StatRowSkeleton count={5} />
          <CardGridSkeleton count={6} />
        </div>
      ) : error ? (
        <ErrorState title="Could not load apps" description={error} onRetry={load} />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Plug strokeWidth={1.75} />}
          title="No apps configured"
          description="Add an integration to connect BunWa with external services."
          action={
            <Button onClick={openCreate}>
              <Plus strokeWidth={1.75} />
              New app
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <StatsCards apps={apps} />
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
        </div>
      )}
    </PageLayout>
  )
}

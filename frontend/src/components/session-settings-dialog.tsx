import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { api, type Session } from "@/lib/api"
import { Plus, Trash2, X, ChevronDown, Check, MessageCircle } from "lucide-react"

const WEBHOOK_EVENTS = [
  { value: "*", label: "All Events" },
  { value: "session.status", label: "Session Status" },
  { value: "message", label: "Message" },
  { value: "message.any", label: "Any Message" },
  { value: "message.reaction", label: "Message Reaction" },
  { value: "message.ack", label: "Message ACK" },
  { value: "message.ack.group", label: "Message ACK Group" },
  { value: "message.waiting", label: "Message Waiting" },
  { value: "message.revoked", label: "Message Revoked" },
  { value: "message.edited", label: "Message Edited" },
  { value: "state.change", label: "State Change" },
  { value: "group.join", label: "Group Join" },
  { value: "group.leave", label: "Group Leave" },
  { value: "group.v2.join", label: "Group V2 Join" },
  { value: "group.v2.leave", label: "Group V2 Leave" },
  { value: "group.v2.update", label: "Group V2 Update" },
  { value: "group.v2.participants", label: "Group V2 Participants" },
  { value: "presence.update", label: "Presence Update" },
  { value: "poll.vote", label: "Poll Vote" },
  { value: "poll.vote.failed", label: "Poll Vote Failed" },
  { value: "chat.archive", label: "Chat Archive" },
  { value: "call.received", label: "Call Received" },
  { value: "call.accepted", label: "Call Accepted" },
  { value: "call.rejected", label: "Call Rejected" },
  { value: "label.upsert", label: "Label Upsert" },
  { value: "label.deleted", label: "Label Deleted" },
  { value: "label.chat.added", label: "Label Chat Added" },
  { value: "label.chat.deleted", label: "Label Chat Deleted" },
  { value: "event.response", label: "Event Response" },
  { value: "event.response.failed", label: "Event Response Failed" },
  { value: "engine.event", label: "Engine Event" },
]

const RETRY_POLICIES = [
  { value: "linear", label: "Linear" },
  { value: "exponential", label: "Exponential" },
  { value: "constant", label: "Constant" },
]

const DEVICE_NAMES = [
  { value: "Ubuntu", label: "Ubuntu" },
  { value: "Mac OS", label: "Mac OS" },
  { value: "Windows", label: "Windows" },
  { value: "Linux", label: "Linux" },
]

const BROWSER_NAMES = [
  { value: "Chrome", label: "Chrome" },
  { value: "Firefox", label: "Firefox" },
  { value: "Safari", label: "Safari" },
  { value: "Edge", label: "Edge" },
]

interface WebhookFilterCondition {
  field: string
  operator: string
  value: string | string[] | boolean
  caseSensitive?: boolean
}

interface WebhookConfig {
  id?: string
  enabled?: boolean
  method?: string
  url: string
  events: string[]
  hmac?: { key?: string }
  retries?: { attempts?: number; delaySeconds?: number; policy?: string }
  customHeaders?: { name: string; value: string }[]
  filters?: { conditions?: WebhookFilterCondition[] }
}

interface SessionSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session | null
  onSaved: () => void
}

function MultiSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[]
  onChange: (value: string[]) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const toggle = (opt: string) => {
    if (opt === "*") {
      onChange(value.length === options.length ? [] : options.map(o => o.value))
      return
    }
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const labels = value.map(v => options.find(o => o.value === v)?.label || v).slice(0, 4)
  const extra = value.length - 4

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="truncate">{value.length === 0 ? placeholder : `${labels.join(", ")}${extra > 0 ? ` +${extra}` : ""}`}</span>
        <ChevronDown className="size-4 opacity-50 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <ScrollArea className="h-56">
            {options.map(opt => (
              <div key={opt.value} className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground" onClick={() => toggle(opt.value)}>
                <div className="mr-2 flex size-4 items-center justify-center rounded-sm border border-primary">
                  {value.includes(opt.value) && <Check className="size-3" />}
                </div>
                <span>{opt.label}</span>
              </div>
            ))}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export function SessionSettingsDialog({ open, onOpenChange, session, onSaved }: SessionSettingsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<"webhooks" | "proxy" | "engine" | "ignore" | "advanced" | "integrations" | "mcp">("webhooks")

  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])
  const [proxyServer, setProxyServer] = useState("")
  const [proxyUsername, setProxyUsername] = useState("")
  const [proxyPassword, setProxyPassword] = useState("")
  const [storeEnabled, setStoreEnabled] = useState(false)
  const [fullSync, setFullSync] = useState(false)
  const [markOnline, setMarkOnline] = useState(true)
  const [engineType, setEngineType] = useState("noweb")
  const [authTimeout, setAuthTimeout] = useState("")
  const [deviceName, setDeviceName] = useState("")
  const [browserName, setBrowserName] = useState("")
  const [ignoreStatus, setIgnoreStatus] = useState(false)
  const [ignoreGroups, setIgnoreGroups] = useState(false)
  const [ignoreChannels, setIgnoreChannels] = useState(false)
  const [ignoreBroadcast, setIgnoreBroadcast] = useState(false)
  const [ignoreDm, setIgnoreDm] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [metadata, setMetadata] = useState<{ key: string; value: string }[]>([])

  // MCP settings
  const [mcpEnabled, setMcpEnabled] = useState(true)
  const [mcpDestructiveOps, setMcpDestructiveOps] = useState(false)
  const [mcpDeniedTools, setMcpDeniedTools] = useState<string[]>([])
  const [mcpTools, setMcpTools] = useState<{ tools: any[]; byCategory: Record<string, any[]> } | null>(null)
  const [mcpLoading, setMcpLoading] = useState(false)
  const [mcpKey, setMcpKey] = useState<string | null>(null)
  const [mcpConnection, setMcpConnection] = useState<any>(null)
  const [mcpKeyRevealed, setMcpKeyRevealed] = useState(false)
  const [mcpKeyExists, setMcpKeyExists] = useState(false)

  // Chatwoot integration state
  const [chatwootEnabled, setChatwootEnabled] = useState(false)
  const [chatwootConfig, setChatwootConfig] = useState({
    url: "",
    accountId: 1,
    accountToken: "",
    inboxId: 1,
    inboxIdentifier: "",
    locale: "en-US",
  })
  const [chatwootAppId, setChatwootAppId] = useState<string | null>(null)
  const [chatwootLoaded, setChatwootLoaded] = useState(false)

  useEffect(() => {
    if (session?.config) {
      const c = session.config as any
      setWebhooks(c.webhooks?.map((w: any) => ({
        id: w.id, enabled: w.enabled !== false, method: w.method || "POST", url: w.url || "", events: w.events || [],
        hmac: w.hmac, retries: w.retries, customHeaders: w.customHeaders || [],
        filters: w.filters,
      })) || [])
      setProxyServer(c.proxy?.server || "")
      setProxyUsername(c.proxy?.username || "")
      setProxyPassword(c.proxy?.password || "")
      setStoreEnabled(c?.noweb?.store?.enabled ?? false)
      setFullSync(c?.noweb?.store?.fullSync ?? false)
      setMarkOnline(c?.noweb?.markOnline ?? true)
      setEngineType((c?.engine || "noweb").toLowerCase())
      setAuthTimeout(c?.webjs?.authTimeout?.toString() || "")
      setDeviceName(c?.client?.deviceName ?? "")
      setBrowserName(c?.client?.browserName ?? "")
      setIgnoreStatus(c?.ignore?.status ?? false)
      setIgnoreGroups(c?.ignore?.groups ?? false)
      setIgnoreChannels(c?.ignore?.channels ?? false)
      setIgnoreBroadcast(c?.ignore?.broadcast ?? false)
      setIgnoreDm(c?.ignore?.dm ?? false)
      setDebugMode(c?.debug?.mode ?? false)
      setMetadata(c.metadata ? Object.entries(c.metadata).map(([k, v]) => ({ key: k, value: String(v) })) : [])
      // MCP config (from session config; the dedicated endpoint overrides on mount)
      if (c?.mcp) {
        setMcpEnabled(c.mcp.enabled ?? true)
        setMcpDestructiveOps(c.mcp.destructiveOps ?? false)
        setMcpDeniedTools(c.mcp.deniedTools ?? [])
      }
    }
  }, [session])

  // Load Chatwoot app config for this session
  useEffect(() => {
    if (!open || !session) return
    setChatwootLoaded(false)
    api.getApps().then((apps) => {
      const chatwoot = apps.find((a: any) => a.app === "chatwoot" && a.session === session.name)
      if (chatwoot) {
        setChatwootAppId(chatwoot.id)
        setChatwootEnabled(chatwoot.enabled)
        setChatwootConfig({
          url: chatwoot.config?.url || "",
          accountId: chatwoot.config?.accountId || 1,
          accountToken: chatwoot.config?.accountToken || "",
          inboxId: chatwoot.config?.inboxId || 1,
          inboxIdentifier: chatwoot.config?.inboxIdentifier || "",
          locale: chatwoot.config?.locale || "en-US",
        })
      } else {
        setChatwootAppId(null)
        setChatwootEnabled(false)
      }
    }).catch(() => {}).finally(() => setChatwootLoaded(true))
  }, [open, session])

  // Load MCP tools list + session config
  useEffect(() => {
    if (!open || !session) return
    setMcpLoading(true)
    Promise.all([
      api.getMcpTools(),
      api.getSessionMcp(session.name),
    ]).then(([tools, config]) => {
      setMcpTools(tools)
      setMcpEnabled(config.enabled)
      setMcpDestructiveOps(config.destructiveOps)
      setMcpDeniedTools(config.deniedTools || [])
      // Check if a key already exists (hash present, plaintext gone)
      const hasKey = !!(config as any).apiKeyHash
      setMcpKeyExists(hasKey)
      setMcpKeyRevealed(false)
      setMcpKey(null)
      setMcpConnection(null)
    }).catch(() => {
      // MCP API not available — silently ignore
    }).finally(() => setMcpLoading(false))
  }, [open, session])

  // Clear revealed key when dialog closes
  useEffect(() => {
    if (!open) {
      setMcpKeyRevealed(false)
      setMcpKey(null)
      setMcpConnection(null)
    }
  }, [open])

  const handleSave = async () => {
    if (!session) return
    setLoading(true)
    try {
      const config: Record<string, any> = {}
      if (webhooks.length > 0) {
        config.webhooks = webhooks.filter(w => w.url).map(w => ({
          ...(w.id && { id: w.id }),
          enabled: w.enabled !== false,
          method: w.method || "POST",
          url: w.url, events: w.events,
          ...(w.hmac?.key && { hmac: w.hmac }),
          ...(w.retries && { retries: w.retries }),
          ...(w.customHeaders?.length && { customHeaders: w.customHeaders }),
          ...(w.filters?.conditions?.length && { filters: w.filters }),
        }))
      }
      if (proxyServer) {
        config.proxy = { server: proxyServer, ...(proxyUsername && { username: proxyUsername }), ...(proxyPassword && { password: proxyPassword }) }
      }
      config.engine = engineType.toUpperCase()
      if (engineType === "webjs") {
        config.webjs = { authTimeout: parseInt(authTimeout) || undefined }
      } else {
        config.noweb = { store: { enabled: storeEnabled, fullSync }, markOnline }
      }
      const client: Record<string, string> = {}
      if (deviceName) client.deviceName = deviceName
      if (browserName) client.browserName = browserName
      if (Object.keys(client).length) config.client = client
      config.ignore = { status: ignoreStatus, groups: ignoreGroups, channels: ignoreChannels, broadcast: ignoreBroadcast, dm: ignoreDm }
      config.debug = { mode: debugMode }
      if (metadata.length > 0) {
        config.metadata = {}
        metadata.forEach(m => { if (m.key) config.metadata[m.key] = m.value })
      }
      // MCP config
      config.mcp = {
        enabled: mcpEnabled,
        destructiveOps: mcpDestructiveOps,
        deniedTools: mcpDeniedTools.length > 0 ? mcpDeniedTools : undefined,
      }
      await api.updateSession(session.name, config)

      // Save Chatwoot separately — failure shouldn't block or look like a settings failure
      try {
        await saveChatwootIntegration()
      } catch (e: any) {
        toast.warning("Session saved, but Chatwoot integration failed: " + (e.message || "unknown error"))
      }

      toast.success("Settings saved")
      onSaved()
      onOpenChange(false)
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings")
    } finally {
      setLoading(false)
    }
  }

  const saveChatwootIntegration = async () => {
    if (!session) return
    try {
      if (chatwootAppId) {
        await api.updateApp(chatwootAppId, {
          enabled: chatwootEnabled,
          config: chatwootConfig,
        })
      } else {
        await api.createApp({
          session: session.name,
          app: "chatwoot",
          enabled: chatwootEnabled,
          config: chatwootConfig,
        })
      }
    } catch (e: any) {
      throw new Error("Chatwoot: " + (e.message || "save failed"))
    }
  }

  const addWebhook = () => setWebhooks([...webhooks, { enabled: true, method: "POST", url: "", events: ["message"], customHeaders: [], filters: { conditions: [] } }])
  const removeWebhook = (i: number) => setWebhooks(webhooks.filter((_, idx) => idx !== i))
  const updateWebhook = (i: number, field: string, value: any) => { const u = [...webhooks]; u[i] = { ...u[i], [field]: value }; setWebhooks(u) }
  const addHeader = (wi: number) => { const u = [...webhooks]; u[wi].customHeaders = [...(u[wi].customHeaders || []), { name: "", value: "" }]; setWebhooks(u) }
  const removeHeader = (wi: number, hi: number) => { const u = [...webhooks]; u[wi].customHeaders = (u[wi].customHeaders || []).filter((_, i) => i !== hi); setWebhooks(u) }
  const updateHeader = (wi: number, hi: number, field: string, val: string) => { const u = [...webhooks]; u[wi].customHeaders = [...(u[wi].customHeaders || [])]; u[wi].customHeaders[hi] = { ...u[wi].customHeaders[hi], [field]: val }; setWebhooks(u) }

  // Filter helpers
  const getFilterValue = (webhook: WebhookConfig, field: string): string => {
    const cond = webhook.filters?.conditions?.find(c => c.field === field)
    if (!cond) return ""
    return Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value)
  }
  const setFilterValue = (wi: number, field: string, value: string) => {
    const u = [...webhooks]
    const wf = { ...u[wi].filters, conditions: [...(u[wi].filters?.conditions || [])] }
    const idx = wf.conditions.findIndex(c => c.field === field)
    if (!value && idx !== -1) {
      wf.conditions.splice(idx, 1)
    } else if (value) {
      const cond = { field, operator: field === "body" ? "contains" : "is", value: field === "sender" ? value.replace(/[^\d,]/g, "").split(",").map(s => s.trim()).filter(Boolean).join(",") : value }
      if (idx !== -1) wf.conditions[idx] = cond
      else wf.conditions.push(cond)
    }
    u[wi] = { ...u[wi], filters: wf.conditions.length ? wf : undefined }
    setWebhooks(u)
  }
  const getBoolFilter = (webhook: WebhookConfig, field: string): boolean => {
    const cond = webhook.filters?.conditions?.find(c => c.field === field)
    return cond?.value === true
  }
  const setBoolFilter = (wi: number, field: string, value: boolean) => {
    const u = [...webhooks]
    const wf = { ...u[wi].filters, conditions: [...(u[wi].filters?.conditions || [])] }
    const idx = wf.conditions.findIndex(c => c.field === field)
    if (!value && idx !== -1) {
      wf.conditions.splice(idx, 1)
    } else if (value) {
      const cond = { field, operator: "is", value: true }
      if (idx !== -1) wf.conditions[idx] = cond
      else wf.conditions.push(cond)
    }
    u[wi] = { ...u[wi], filters: wf.conditions.length ? wf : undefined }
    setWebhooks(u)
  }

  const tabs = [
    { id: "webhooks" as const, label: "Webhooks" },
    { id: "proxy" as const, label: "Proxy" },
    { id: "engine" as const, label: "Engine" },
    { id: "ignore" as const, label: "Ignore" },
    { id: "mcp" as const, label: "MCP Tools" },
    { id: "advanced" as const, label: "Advanced" },
    { id: "integrations" as const, label: "Integrations" },
  ]

  if (!session) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full sm:h-auto sm:max-w-5xl sm:max-h-[85vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-xl">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="text-base sm:text-sm">Session Settings — {session.name}</DialogTitle>
        </DialogHeader>

        {/* Tab Bar — horizontal scroll on mobile */}
        <div className="flex gap-0.5 border-b overflow-x-auto shrink-0 scrollbar-none">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area — scrollable */}
        <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 sm:px-6 sm:py-4">
            {activeTab === "webhooks" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Webhook Endpoints</h4>
                  <Button variant="outline" size="sm" onClick={addWebhook}><Plus className="size-4 mr-1" /> Add</Button>
                </div>
                {webhooks.length === 0 && <p className="text-sm text-muted-foreground py-4">No webhooks configured.</p>}
                {webhooks.map((webhook, wi) => (
                  <div key={wi} className={`border rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4 ${webhook.enabled === false ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Webhook {wi + 1}</Badge>
                        {webhook.id && <span className="text-[10px] font-mono text-muted-foreground">{webhook.id}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => updateWebhook(wi, "enabled", webhook.enabled === false ? true : false)}
                          className="text-xs h-7 px-2">
                          {webhook.enabled === false ? "Enable" : "Disable"}
                        </Button>
                        {session && webhook.id && (
                          <Button variant="ghost" size="sm" onClick={async () => {
                            try {
                              await api.testWebhook(session.name, webhook.id!)
                              toast.success("Test webhook sent")
                            } catch (e: any) {
                              toast.error("Test failed: " + (e.message || "unknown"))
                            }
                          }} className="text-xs h-7 px-2">
                            Test
                          </Button>
                        )}
                        <Button variant="ghost" size="icon-sm" onClick={() => removeWebhook(wi)}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-24 shrink-0 space-y-2">
                        <Label>Method</Label>
                        <Select value={webhook.method || "POST"} onValueChange={(v) => updateWebhook(wi, "method", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="GET">GET</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label>URL</Label>
                        <Input placeholder="https://example.com/webhook" value={webhook.url} onChange={(e) => updateWebhook(wi, "url", e.target.value)} className="w-full" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Events</Label>
                      <MultiSelect value={webhook.events} onChange={(v) => updateWebhook(wi, "events", v)} options={WEBHOOK_EVENTS} placeholder="Select events..." />
                    </div>
                    <div className="space-y-2">
                      <Label>HMAC Key</Label>
                      <Input type="password" placeholder="Secret for X-WAHA-Signature" value={webhook.hmac?.key || ""} onChange={(e) => updateWebhook(wi, "hmac", { key: e.target.value })} className="w-full" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Retry Policy</Label>
                        <Select value={webhook.retries?.policy || ""} onValueChange={(v) => updateWebhook(wi, "retries", { ...webhook.retries, policy: v })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Policy" /></SelectTrigger>
                          <SelectContent>{RETRY_POLICIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Max Retries</Label>
                        <Input type="number" placeholder="3" value={webhook.retries?.attempts || ""} onChange={(e) => updateWebhook(wi, "retries", { ...webhook.retries, attempts: parseInt(e.target.value) || undefined })} className="w-full" />
                      </div>
                      <div className="space-y-2">
                        <Label>Retry Delay (s)</Label>
                        <Input type="number" placeholder="2" value={webhook.retries?.delaySeconds || ""} onChange={(e) => updateWebhook(wi, "retries", { ...webhook.retries, delaySeconds: parseInt(e.target.value) || undefined })} className="w-full" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between"><Label>Custom Headers</Label><Button variant="ghost" size="sm" onClick={() => addHeader(wi)}><Plus className="size-3 mr-1" /> Add</Button></div>
                      {(webhook.customHeaders || []).map((h, hi) => (
                        <div key={hi} className="flex gap-2">
                          <Input placeholder="Name" value={h.name} onChange={(e) => updateHeader(wi, hi, "name", e.target.value)} className="flex-1" />
                          <Input placeholder="Value" value={h.value} onChange={(e) => updateHeader(wi, hi, "value", e.target.value)} className="flex-1" />
                          <Button variant="ghost" size="icon-sm" onClick={() => removeHeader(wi, hi)} className="shrink-0"><X className="size-4" /></Button>
                        </div>
                      ))}
                    </div>
                    {/* Filters */}
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Filters</Label>
                      <p className="text-[11px] text-muted-foreground">All conditions must match (AND logic)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Sender</Label>
                          <Input placeholder="1234567890 (comma-separated)" value={getFilterValue(webhook, "sender")} onChange={(e) => setFilterValue(wi, "sender", e.target.value)} className="h-8 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Body contains</Label>
                          <Input placeholder="Text to match" value={getFilterValue(webhook, "body")} onChange={(e) => setFilterValue(wi, "body", e.target.value)} className="h-8 text-xs" />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { field: "isGroup", label: "Group only" },
                          { field: "fromMe", label: "Sent by me" },
                          { field: "hasMedia", label: "Has media" },
                        ].map(({ field, label }) => (
                          <div key={field} className="flex items-center gap-1.5">
                            <Switch
                              checked={getBoolFilter(webhook, field)}
                              onCheckedChange={(v) => setBoolFilter(wi, field, v)}
                              className="scale-75"
                            />
                            <Label className="text-xs">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "proxy" && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Proxy Configuration</h4>
                <div className="space-y-2"><Label>Server URL</Label><Input placeholder="socks5://host:port or http://host:port" value={proxyServer} onChange={(e) => setProxyServer(e.target.value)} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Username</Label><Input placeholder="Optional" value={proxyUsername} onChange={(e) => setProxyUsername(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Password</Label><Input type="password" placeholder="Optional" value={proxyPassword} onChange={(e) => setProxyPassword(e.target.value)} /></div>
                </div>
              </div>
            )}

            {activeTab === "engine" && (
              <div className="space-y-6">
                {/* Engine Selector */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Engine Type</h4>
                  <Select value={engineType} onValueChange={setEngineType}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Select engine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noweb">NOWEB — Baileys (lightweight)</SelectItem>
                      <SelectItem value="webjs">WEBJS — Chrome/Puppeteer (stable)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* NOWEB Config */}
                {engineType === "noweb" && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Baileys Engine Settings</h4>
                    <div className="flex items-center justify-between gap-4"><div className="space-y-0.5"><Label>Enable Store</Label><p className="text-xs text-muted-foreground">Persist contacts, chats, messages</p></div><Switch checked={storeEnabled} onCheckedChange={setStoreEnabled} /></div>
                    {storeEnabled && <div className="flex items-center justify-between gap-4"><div className="space-y-0.5"><Label>Full Sync</Label><p className="text-xs text-muted-foreground">1 year history vs 3 months</p></div><Switch checked={fullSync} onCheckedChange={setFullSync} /></div>}
                    <div className="flex items-center justify-between gap-4"><div className="space-y-0.5"><Label>Mark Online</Label><p className="text-xs text-muted-foreground">Online presence on start</p></div><Switch checked={markOnline} onCheckedChange={setMarkOnline} /></div>
                  </div>
                )}

                {/* WEBJS Config */}
                {engineType === "webjs" && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">WebJS Engine Settings</h4>
                    <div className="space-y-2">
                      <Label>Auth Timeout (ms)</Label>
                      <Input
                        type="number"
                        placeholder="30000"
                        value={authTimeout}
                        onChange={(e) => setAuthTimeout(e.target.value)}
                        className="w-full sm:w-64"
                      />
                      <p className="text-xs text-muted-foreground">Max time to wait for authentication before timeout</p>
                    </div>
                  </div>
                )}

                {/* Common: Client Identity */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Client Identity</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                    <div className="space-y-2"><Label>Device</Label><Select value={deviceName} onValueChange={setDeviceName}><SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger><SelectContent>{DEVICE_NAMES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Browser</Label><Select value={browserName} onValueChange={setBrowserName}><SelectTrigger><SelectValue placeholder="Select browser" /></SelectTrigger><SelectContent>{BROWSER_NAMES.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ignore" && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Ignore Messages</h4>
                <p className="text-xs text-muted-foreground">Filter out specific message types</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-1"><Label>Status Broadcasts</Label><Switch checked={ignoreStatus} onCheckedChange={setIgnoreStatus} /></div>
                  <div className="flex items-center justify-between py-1"><Label>Groups</Label><Switch checked={ignoreGroups} onCheckedChange={setIgnoreGroups} /></div>
                  <div className="flex items-center justify-between py-1"><Label>Channels</Label><Switch checked={ignoreChannels} onCheckedChange={setIgnoreChannels} /></div>
                  <div className="flex items-center justify-between py-1"><Label>Broadcasts</Label><Switch checked={ignoreBroadcast} onCheckedChange={setIgnoreBroadcast} /></div>
                  <div className="flex items-center justify-between py-1"><Label>Direct Messages</Label><Switch checked={ignoreDm} onCheckedChange={setIgnoreDm} /></div>
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Debug</h4>
                  <div className="flex items-center justify-between gap-4"><div className="space-y-0.5"><Label>Debug Mode</Label><p className="text-xs text-muted-foreground">Verbose logging</p></div><Switch checked={debugMode} onCheckedChange={setDebugMode} /></div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Metadata</h4><Button variant="outline" size="sm" onClick={() => setMetadata([...metadata, { key: "", value: "" }])}><Plus className="size-4 mr-1" /> Add</Button></div>
                  <p className="text-xs text-muted-foreground">Custom key-value data for webhook payloads</p>
                  {metadata.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder="Key" value={m.key} onChange={(e) => { const u = [...metadata]; u[i] = { ...u[i], key: e.target.value }; setMetadata(u) }} className="flex-1" />
                      <Input placeholder="Value" value={m.value} onChange={(e) => { const u = [...metadata]; u[i] = { ...u[i], value: e.target.value }; setMetadata(u) }} className="flex-1" />
                      <Button variant="ghost" size="icon-sm" onClick={() => setMetadata(metadata.filter((_, idx) => idx !== i))}><X className="size-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "mcp" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-medium">MCP Server</h4>
                    <p className="text-xs text-muted-foreground">
                      Model Context Protocol — AI assistants can call WhatsApp tools through MCP
                    </p>
                  </div>
                  <Switch checked={mcpEnabled} onCheckedChange={setMcpEnabled} />
                </div>

                {mcpEnabled && (
                  <>
                    <Separator />

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label>Allow Destructive Ops</Label>
                        <p className="text-xs text-muted-foreground">
                          Permit delete, clear, and other irreversible operations
                        </p>
                      </div>
                      <Switch
                        checked={mcpDestructiveOps}
                        onCheckedChange={setMcpDestructiveOps}
                      />
                    </div>

                    {mcpDestructiveOps && (
                      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
                        <p className="text-xs text-yellow-600 dark:text-yellow-400">
                          Destructive operations are enabled. AI assistants will be able to delete
                          messages, clear chats, remove group participants, and perform other
                          irreversible actions.
                        </p>
                      </div>
                    )}

                    <Separator />

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium">Tool Toggles</h4>
                      <p className="text-xs text-muted-foreground">
                        Disable specific tools or entire categories by name
                      </p>

                      {mcpLoading ? (
                        <p className="text-sm text-muted-foreground py-4">Loading tools...</p>
                      ) : mcpTools ? (
                        <div className="space-y-4">
                          {Object.entries(mcpTools.byCategory).map(([category, tools]) => (
                            <div key={category} className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="uppercase text-[10px] tracking-wider">
                                  {category}
                                </Badge>
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                  onClick={() => {
                                    const allInCategory = tools.map((t: any) => t.name)
                                    const allDenied = allInCategory.every((n: string) => mcpDeniedTools.includes(n))
                                    if (allDenied) {
                                      setMcpDeniedTools(mcpDeniedTools.filter(n => !allInCategory.includes(n)))
                                    } else {
                                      setMcpDeniedTools([...new Set([...mcpDeniedTools, ...allInCategory])])
                                    }
                                  }}
                                >
                                  {tools.every((t: any) => mcpDeniedTools.includes(t.name)) ? "Enable all" : "Disable all"}
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {tools.map((tool: any) => {
                                  const denied = mcpDeniedTools.includes(tool.name)
                                  return (
                                    <div
                                      key={tool.name}
                                      className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                                        denied ? "opacity-50" : ""
                                      } ${tool.destructive ? "border-red-500/20" : ""}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xs font-medium truncate">{tool.name}</span>
                                        {tool.destructive && (
                                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-red-500 border-red-500/30 shrink-0">
                                            destructive
                                          </Badge>
                                        )}
                                      </div>
                                      <Switch
                                        checked={!denied}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setMcpDeniedTools(mcpDeniedTools.filter(n => n !== tool.name))
                                          } else {
                                            setMcpDeniedTools([...mcpDeniedTools, tool.name])
                                          }
                                        }}
                                        className="shrink-0 ml-2"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4">Could not load tool list.</p>
                      )}
                    </div>
                  </>
                )}

                <Separator className="my-4" />

                {/* ── Per-Session MCP Key ──────────────────────────── */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">MCP Connection Key</h4>
                  <p className="text-xs text-muted-foreground">
                    Generate a scoped API key for this session. The key is shown <strong>once</strong> —
                    copy it before closing this dialog. Only a SHA-256 hash is stored.
                  </p>

                  {mcpKeyExists && !mcpKeyRevealed && (
                    <p className="text-xs text-muted-foreground">
                      A key is configured for this session. Click <strong>Regenerate</strong> to
                      create a new one (invalidates the old key).
                    </p>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mcpLoading}
                    onClick={async () => {
                      try {
                        const result = await api.generateMcpKey(session.name)
                        setMcpKey(result.key)
                        setMcpConnection(result.connection)
                        setMcpKeyRevealed(true)
                        setMcpKeyExists(true)
                      } catch (e: any) {
                        toast.error(e.message || "Failed to generate MCP key")
                      }
                    }}
                  >
                    {mcpKeyExists ? "Regenerate Key" : "Generate MCP Key"}
                  </Button>

                  {mcpKeyRevealed && mcpKey && mcpConnection && (
                    <div className="space-y-4 pt-2">
                      {/* Key display */}
                      <div>
                        <p className="text-xs font-medium mb-1 text-destructive">
                          Copy this key now — it will not be shown again.
                        </p>
                        <div className="flex items-center gap-2">
                          <pre className="flex-1 rounded-lg bg-muted p-2.5 text-[11px] font-mono overflow-x-auto select-all">{mcpKey}</pre>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(mcpKey)
                              toast.success("Key copied")
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                      </div>

                      {/* stdio config */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium">stdio (Claude Desktop, Cursor, Windsurf)</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify({ mcpServers: { [`bunwa-${session.name}`]: mcpConnection.stdio } }, null, 2))
                              toast.success("stdio config copied")
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                        <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto">
{JSON.stringify({ mcpServers: { [`bunwa-${session.name}`]: mcpConnection.stdio } }, null, 2)}
                        </pre>
                      </div>

                      {/* HTTP/SSE config */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium">HTTP / SSE (remote, Docker)</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify({ mcpServers: { [`bunwa-${session.name}`]: mcpConnection.http } }, null, 2))
                              toast.success("HTTP config copied")
                            }}
                          >
                            Copy
                          </Button>
                        </div>
                        <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto">
{JSON.stringify({ mcpServers: { [`bunwa-${session.name}`]: mcpConnection.http } }, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {!mcpKeyRevealed && (
                    <div className="space-y-4 pt-2">
                      <p className="text-xs text-muted-foreground">
                        Legacy connection guides (with placeholder key):
                      </p>
                      <div>
                        <p className="text-xs font-medium mb-1">Claude Desktop</p>
                        <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto">
{`{
  "mcpServers": {
    "bunwa": {
      "url": "${window.location.origin}/mcp",
      "headers": {
        "X-Api-Key": "your-waha-api-key"
      }
    }
  }
}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-medium mb-1">Cursor</p>
                        <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto">
{`{
  "mcpServers": {
    "bunwa": {
      "url": "${window.location.origin}/mcp",
      "headers": {
        "X-Api-Key": "your-waha-api-key"
      }
    }
  }
}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-medium mb-1">Windsurf / VS Code (Continue)</p>
                        <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto">
{`{
  "mcpServers": {
    "bunwa": {
      "command": "bunx",
      "args": ["@openclaw/mcp-proxy", "${window.location.origin}/mcp"],
      "env": {
        "X-Api-Key": "your-waha-api-key"
      }
    }
  }
}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-medium mb-1">MCP Inspector (Test Tool)</p>
                        <pre className="rounded-lg bg-muted p-3 text-[11px] font-mono overflow-x-auto">{`bunx @modelcontextprotocol/inspector ${window.location.origin}/mcp`}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "integrations" && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <MessageCircle className="size-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">Chatwoot Integration</h4>
                    <p className="text-xs text-muted-foreground">
                      Forward WhatsApp messages to Chatwoot and send agent replies back to WhatsApp
                    </p>
                  </div>
                </div>

                {!chatwootLoaded ? (
                  <p className="text-sm text-muted-foreground py-4">Loading integration config...</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label>Enabled</Label>
                        <p className="text-xs text-muted-foreground">Bridge messages between this session and Chatwoot</p>
                      </div>
                      <Switch checked={chatwootEnabled} onCheckedChange={setChatwootEnabled} />
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Chatwoot URL *</Label>
                        <Input
                          placeholder="http://chatwoot:3000"
                          value={chatwootConfig.url}
                          onChange={(e) => setChatwootConfig({ ...chatwootConfig, url: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Account ID *</Label>
                          <Input
                            type="number"
                            placeholder="1"
                            value={chatwootConfig.accountId}
                            onChange={(e) => setChatwootConfig({ ...chatwootConfig, accountId: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Account Token *</Label>
                          <Input
                            placeholder="Chatwoot API token"
                            value={chatwootConfig.accountToken}
                            onChange={(e) => setChatwootConfig({ ...chatwootConfig, accountToken: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Inbox ID *</Label>
                          <Input
                            type="number"
                            placeholder="1"
                            value={chatwootConfig.inboxId}
                            onChange={(e) => setChatwootConfig({ ...chatwootConfig, inboxId: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Inbox Identifier</Label>
                          <Input
                            placeholder="Optional UUID"
                            value={chatwootConfig.inboxIdentifier}
                            onChange={(e) => setChatwootConfig({ ...chatwootConfig, inboxIdentifier: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Locale</Label>
                        <Select
                          value={chatwootConfig.locale}
                          onValueChange={(v) => setChatwootConfig({ ...chatwootConfig, locale: v })}
                        >
                          <SelectTrigger className="w-full sm:w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en-US">English (US)</SelectItem>
                            <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                            <SelectItem value="es">Español</SelectItem>
                            <SelectItem value="id">Bahasa Indonesia</SelectItem>
                            <SelectItem value="fr">Français</SelectItem>
                            <SelectItem value="de">Deutsch</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                      <p className="text-xs text-muted-foreground">
                        <strong>Webhook URL:</strong> Configure Chatwoot to send{" "}
                        <code className="text-[10px] bg-muted px-1 rounded">message_created</code> events to{" "}
                        <code className="text-[10px] bg-muted px-1 rounded">http://YOUR_BUNWA_HOST:3001/webhook/chatwoot/{session?.name}</code>
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer — sticky */}
        <div className="flex gap-2 px-4 sm:px-6 py-4 border-t bg-background shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 sm:flex-none">Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="flex-1 sm:flex-none">{loading ? "Saving..." : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

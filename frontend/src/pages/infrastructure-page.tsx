import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Database, Server, HardDrive, RefreshCw, Save, Monitor, Smartphone, Eye, EyeOff } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ErrorState, Skeleton, StatRowSkeleton } from "@/components/primitives"

interface InfraConfig {
  database: { type: string; host: string; port: string; username: string; password: string; name: string; ssl: boolean }
  storage: { type: string; localPath: string; s3: { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string } }
  queue: { enabled: boolean; redis: { host: string; port: string; password: string } }
  engine: string
  /** Reported by the server: the driver the runtime is actually using now. */
  runtime?: { databaseDriver: string }
}

const ENGINES = [
  {
    value: "NOWEB",
    title: "Baileys (noweb)",
    subtitle: "WhatsApp Web API",
    description: "Free, fast, no Chrome needed. Uses raw WhatsApp protocol.",
  },
  {
    value: "WEBJS",
    title: "whatsapp-web.js",
    subtitle: "Chrome + Puppeteer",
    description: "More features but requires Chrome/Puppeteer.",
  },
]

export function InfrastructurePage() {
  const [config, setConfig] = useState<InfraConfig>({
    database: { type: "sqlite", host: "localhost", port: "5432", username: "", password: "", name: "./data/waha.sqlite", ssl: false },
    storage: { type: "local", localPath: "./data/media", s3: { endpoint: "", bucket: "", region: "us-east-1", accessKeyId: "", secretAccessKey: "" } },
    queue: { enabled: false, redis: { host: "localhost", port: "6379", password: "" } },
    engine: "NOWEB",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showDbPassword, setShowDbPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<string>("")

  const runtimeDriver = config.runtime?.databaseDriver
  const dirty = JSON.stringify(config) !== savedSnapshot

  useEffect(() => { loadConfig() }, [])

  async function loadConfig(silent = false) {
    if (!silent) { setLoading(true); setError(null) }
    try {
      const loaded = await api.getInfraConfig()
      setConfig(loaded)
      setSavedSnapshot(JSON.stringify(loaded))
    } catch (err: any) {
      if (!silent) setError(err?.message || "Could not load configuration")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    try {
      await api.saveInfraConfig(config)
      await loadConfig(true)
      toast.success("Configuration saved. Applies to new sessions; restart for everything.")
    } catch (err: any) { toast.error(err?.message || "Failed to save config") }
    setSaving(false)
  }

  async function testDb() {
    setTesting(true)
    try {
      const res = await api.testDatabase(config.database)
      if (res.ok) toast.success(res.version ? `Connected: ${res.version}` : "Connection OK")
      else toast.error(res.message || "Could not connect")
    } catch (err: any) {
      toast.error(err?.message || "Could not connect")
    }
    setTesting(false)
  }

  async function restart() {
    try {
      await api.restartServer()
      toast.success("Server restarting. The console will reconnect shortly.")
    } catch (err: any) { toast.error(err?.message || "Failed to restart") }
  }

  return (
    <PageLayout
      title="Infrastructure"
      description="Configure database, storage, and queue settings"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={restart}>
            <RefreshCw strokeWidth={1.75} />
            Restart
          </Button>
          {dirty && !loading && !saving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-warning" />
              Unsaved changes
            </span>
          )}
          <Button
            onClick={saveConfig}
            disabled={saving || loading || !dirty}
            title={!dirty ? "No changes to save" : undefined}
          >
            <Save strokeWidth={1.75} />
            {saving ? "Saving" : "Save changes"}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <StatRowSkeleton count={4} />
          <div className="grid gap-6 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-4 rounded-lg border border-border bg-card p-5">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <ErrorState title="Could not load configuration" description={error} onRetry={loadConfig} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Database */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <Database className="size-4" strokeWidth={1.75} />
                    Database
                  </CardTitle>
                  <CardDescription>
                    Session storage backend. Changes apply to sessions started after saving;
                    restart to apply everywhere. Data stays in its current backend.
                  </CardDescription>
                </div>
                {runtimeDriver && (
                  <Badge variant={runtimeDriver === "postgres" ? "default" : "secondary"} className="shrink-0">
                    Runtime: {runtimeDriver === "postgres" ? "PostgreSQL" : "SQLite"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="db-engine">Engine</Label>
                <Select value={config.database.type} onValueChange={v => {
                  const db = { ...config.database, type: v }
                  // Carry over the defaults when the field still holds the
                  // other backend's default value.
                  const looksLikePath = db.name.includes("/") || /\.(sqlite3?|db)$/i.test(db.name)
                  if (v === "postgres" && looksLikePath) db.name = "waha"
                  if (v === "sqlite" && !looksLikePath) db.name = "./data/waha.sqlite"
                  setConfig({ ...config, database: db })
                }}>
                  <SelectTrigger id="db-engine"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sqlite">SQLite (built-in)</SelectItem>
                    <SelectItem value="postgres">PostgreSQL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.database.type === "postgres" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="db-host">Host</Label>
                      <Input id="db-host" value={config.database.host} onChange={e => setConfig({ ...config, database: { ...config.database, host: e.target.value } })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="db-port">Port</Label>
                      <Input id="db-port" className="metric" value={config.database.port} onChange={e => setConfig({ ...config, database: { ...config.database, port: e.target.value } })} />
                      <p className="text-xs text-muted-foreground">Default 5432.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-username">Username</Label>
                    <Input id="db-username" value={config.database.username} onChange={e => setConfig({ ...config, database: { ...config.database, username: e.target.value } })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-password">Password</Label>
                    <div className="relative">
                      <Input id="db-password" type={showDbPassword ? "text" : "password"} value={config.database.password} onChange={e => setConfig({ ...config, database: { ...config.database, password: e.target.value } })} />
                      <button
                        type="button"
                        onClick={() => setShowDbPassword(v => !v)}
                        aria-label={showDbPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                      >
                        {showDbPassword ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db-name">Database name</Label>
                    <Input id="db-name" value={config.database.name} onChange={e => setConfig({ ...config, database: { ...config.database, name: e.target.value } })} />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={testDb} disabled={testing}>
                      {testing ? "Testing" : "Test connection"}
                    </Button>
                    <p className="text-xs text-muted-foreground">Checks these settings before saving.</p>
                  </div>
                </>
              )}
              {config.database.type === "sqlite" && (
                <div className="space-y-2">
                  <Label htmlFor="db-path">Database file</Label>
                  <Input id="db-path" className="font-mono" value={config.database.name} onChange={e => setConfig({ ...config, database: { ...config.database, name: e.target.value } })} />
                  <p className="text-xs text-muted-foreground">Path on the server filesystem.</p>
                </div>
              )}
              {config.database.type === "sqlite" && (
                <p className="text-xs text-muted-foreground">
                  Built-in, zero setup. Each session gets its own database file.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Storage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <HardDrive className="size-4" strokeWidth={1.75} />
                Storage
              </CardTitle>
              <CardDescription>Configure the media storage backend.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storage-type">Storage type</Label>
                <Select value={config.storage.type} onValueChange={v => setConfig({ ...config, storage: { ...config.storage, type: v } })}>
                  <SelectTrigger id="storage-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local filesystem</SelectItem>
                    <SelectItem value="s3">S3 or S3-compatible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.storage.type === "local" && (
                <div className="space-y-2">
                  <Label htmlFor="storage-path">Media path</Label>
                  <Input id="storage-path" className="font-mono" value={config.storage.localPath} onChange={e => setConfig({ ...config, storage: { ...config.storage, localPath: e.target.value } })} />
                  <p className="text-xs text-muted-foreground">Path on the server filesystem.</p>
                </div>
              )}
              {config.storage.type === "s3" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="s3-endpoint">Endpoint</Label>
                    <Input id="s3-endpoint" value={config.storage.s3.endpoint} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, endpoint: e.target.value } } })} placeholder="https://s3.amazonaws.com" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="s3-bucket">Bucket</Label>
                      <Input id="s3-bucket" value={config.storage.s3.bucket} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, bucket: e.target.value } } })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="s3-region">Region</Label>
                      <Input id="s3-region" value={config.storage.s3.region} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, region: e.target.value } } })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-access-key">Access key ID</Label>
                    <Input id="s3-access-key" type="password" value={config.storage.s3.accessKeyId} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, accessKeyId: e.target.value } } })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3-secret-key">Secret access key</Label>
                    <Input id="s3-secret-key" type="password" value={config.storage.s3.secretAccessKey} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, secretAccessKey: e.target.value } } })} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Server className="size-4" strokeWidth={1.75} />
                Queue
              </CardTitle>
              <CardDescription>Configure BullMQ for async webhook delivery.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="queue-enabled">Enable queue</Label>
                  <p className="text-xs text-muted-foreground">Deliver webhooks through Redis instead of in-process.</p>
                </div>
                <Switch
                  id="queue-enabled"
                  checked={config.queue.enabled}
                  onCheckedChange={(v) => setConfig({ ...config, queue: { ...config.queue, enabled: v } })}
                />
              </div>
              {config.queue.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="redis-host">Redis host</Label>
                      <Input id="redis-host" value={config.queue.redis.host} onChange={e => setConfig({ ...config, queue: { ...config.queue, redis: { ...config.queue.redis, host: e.target.value } } })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="redis-port">Redis port</Label>
                      <Input id="redis-port" className="metric" value={config.queue.redis.port} onChange={e => setConfig({ ...config, queue: { ...config.queue, redis: { ...config.queue.redis, port: e.target.value } } })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="redis-password">Password</Label>
                    <Input id="redis-password" type="password" value={config.queue.redis.password} onChange={e => setConfig({ ...config, queue: { ...config.queue, redis: { ...config.queue.redis, password: e.target.value } } })} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Engine */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Smartphone className="size-4" strokeWidth={1.75} />
                WhatsApp engine
              </CardTitle>
              <CardDescription>Select the WhatsApp connection engine.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {ENGINES.map((engine) => {
                  const selected = config.engine === engine.value
                  return (
                    <button
                      key={engine.value}
                      type="button"
                      onClick={() => setConfig({ ...config, engine: engine.value })}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-xl border-2 p-4 text-left transition-all duration-200 hover:-translate-y-0.5",
                        selected ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/40",
                      )}
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <div className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                        )}>
                          <Monitor className="size-4" strokeWidth={1.75} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{engine.title}</p>
                          <p className="text-xs text-muted-foreground">{engine.subtitle}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{engine.description}</p>
                      {selected && <Badge variant="secondary" className="mt-3">Selected</Badge>}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  )
}

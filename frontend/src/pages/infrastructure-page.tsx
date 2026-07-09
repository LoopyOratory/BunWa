import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Database, Server, HardDrive, RefreshCw, Save, Monitor, Smartphone } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { api } from "@/lib/api"

interface InfraConfig {
  database: { type: string; host: string; port: string; username: string; name: string; ssl: boolean }
  storage: { type: string; localPath: string; s3: { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string } }
  queue: { enabled: boolean; redis: { host: string; port: string; password: string } }
  engine: string
}

export function InfrastructurePage() {
  const [config, setConfig] = useState<InfraConfig>({
    database: { type: "sqlite", host: "localhost", port: "5432", username: "", name: "./data/waha.sqlite", ssl: false },
    storage: { type: "local", localPath: "./data/media", s3: { endpoint: "", bucket: "", region: "us-east-1", accessKeyId: "", secretAccessKey: "" } },
    queue: { enabled: false, redis: { host: "localhost", port: "6379", password: "" } },
    engine: "NOWEB",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      setConfig(await api.getInfraConfig())
    } catch (err) { toast.error("Failed to load config") }
    setLoading(false)
  }

  async function saveConfig() {
    setSaving(true)
    try {
      await api.saveInfraConfig(config)
      toast.success("Configuration saved. Restart to apply.")
    } catch (err: any) { toast.error(err?.message || "Failed to save config") }
    setSaving(false)
  }

  async function restart() {
    try {
      await api.restartServer()
      toast.success("Server restarting…")
    } catch (err: any) { toast.error(err?.message || "Failed to restart") }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><RefreshCw className="h-10 w-10 animate-spin" /></div>

  return (
    <PageLayout title="Infrastructure" description="Configure database, storage, and queue settings" actions={
      <div className="flex gap-2">
        <Button variant="outline" onClick={restart}><RefreshCw className="h-5 w-5 mr-2" />Restart</Button>
        <Button onClick={saveConfig} disabled={saving}><Save className="h-5 w-5 mr-2" />{saving ? "Saving..." : "Save"}</Button>
      </div>
    }>
      <div className="space-y-6">

      <div className="grid gap-6 md:grid-cols-2">
        {/* Database */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Database</CardTitle><CardDescription>Configure data storage backend</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Engine</Label>
              <Select value={config.database.type} onValueChange={v => setConfig({ ...config, database: { ...config.database, type: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqlite">SQLite (built-in)</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.database.type === "postgres" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Host</Label><Input value={config.database.host} onChange={e => setConfig({ ...config, database: { ...config.database, host: e.target.value } })} /></div>
                  <div><Label>Port</Label><Input value={config.database.port} onChange={e => setConfig({ ...config, database: { ...config.database, port: e.target.value } })} /></div>
                </div>
                <div><Label>Username</Label><Input value={config.database.username} onChange={e => setConfig({ ...config, database: { ...config.database, username: e.target.value } })} /></div>
                <div><Label>Database</Label><Input value={config.database.name} onChange={e => setConfig({ ...config, database: { ...config.database, name: e.target.value } })} /></div>
              </>
            )}
            {config.database.type === "sqlite" && (
              <div><Label>Path</Label><Input value={config.database.name} onChange={e => setConfig({ ...config, database: { ...config.database, name: e.target.value } })} /></div>
            )}
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" />Storage</CardTitle><CardDescription>Configure media storage backend</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Storage Type</Label>
              <Select value={config.storage.type} onValueChange={v => setConfig({ ...config, storage: { ...config.storage, type: v } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Filesystem</SelectItem>
                  <SelectItem value="s3">S3 / S3-compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {config.storage.type === "local" && (
              <div><Label>Path</Label><Input value={config.storage.localPath} onChange={e => setConfig({ ...config, storage: { ...config.storage, localPath: e.target.value } })} /></div>
            )}
            {config.storage.type === "s3" && (
              <>
                <div><Label>Endpoint</Label><Input value={config.storage.s3.endpoint} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, endpoint: e.target.value } } })} placeholder="https://s3.amazonaws.com" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Bucket</Label><Input value={config.storage.s3.bucket} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, bucket: e.target.value } } })} /></div>
                  <div><Label>Region</Label><Input value={config.storage.s3.region} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, region: e.target.value } } })} /></div>
                </div>
                <div><Label>Access Key ID</Label><Input type="password" value={config.storage.s3.accessKeyId} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, accessKeyId: e.target.value } } })} /></div>
                <div><Label>Secret Access Key</Label><Input type="password" value={config.storage.s3.secretAccessKey} onChange={e => setConfig({ ...config, storage: { ...config.storage, s3: { ...config.storage.s3, secretAccessKey: e.target.value } } })} /></div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Queue */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Queue</CardTitle><CardDescription>Configure BullMQ for async webhook delivery</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Enable Queue</Label>
              <input type="checkbox" checked={config.queue.enabled} onChange={e => setConfig({ ...config, queue: { ...config.queue, enabled: e.target.checked } })} className="h-5 w-5" />
            </div>
            {config.queue.enabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Redis Host</Label><Input value={config.queue.redis.host} onChange={e => setConfig({ ...config, queue: { ...config.queue, redis: { ...config.queue.redis, host: e.target.value } } })} /></div>
                  <div><Label>Redis Port</Label><Input value={config.queue.redis.port} onChange={e => setConfig({ ...config, queue: { ...config.queue, redis: { ...config.queue.redis, port: e.target.value } } })} /></div>
                </div>
                <div><Label>Password</Label><Input type="password" value={config.queue.redis.password} onChange={e => setConfig({ ...config, queue: { ...config.queue, redis: { ...config.queue.redis, password: e.target.value } } })} /></div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Engine */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />WhatsApp Engine</CardTitle><CardDescription>Select the WhatsApp connection engine</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`p-5 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${config.engine === "NOWEB" ? "border-emerald-500 bg-emerald-500/5" : "border-border hover:border-muted-foreground/30"}`}
                onClick={() => setConfig({ ...config, engine: "NOWEB" })}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${config.engine === "NOWEB" ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Baileys (noweb)</h4>
                    <p className="text-[11px] text-base text-muted-foreground">WhatsApp Web API</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/80">Free, fast, no Chrome needed. Uses raw WhatsApp protocol.</p>
                {config.engine === "NOWEB" && <Badge className="mt-3 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 border-0">Selected</Badge>}
              </div>
              <div
                className={`p-5 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${config.engine === "WEBJS" ? "border-blue-500 bg-blue-500/5" : "border-border hover:border-muted-foreground/30"}`}
                onClick={() => setConfig({ ...config, engine: "WEBJS" })}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${config.engine === "WEBJS" ? "bg-blue-500/15 text-blue-500" : "bg-muted text-muted-foreground"}`}>
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">whatsapp-web.js</h4>
                    <p className="text-[11px] text-base text-muted-foreground">Chrome + Puppeteer</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/80">More features but requires Chrome/Puppeteer.</p>
                {config.engine === "WEBJS" && <Badge className="mt-3 bg-blue-500/15 text-blue-600 hover:bg-blue-500/20 border-0">Selected</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </PageLayout>
  )
}

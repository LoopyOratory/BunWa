import { useState, useEffect } from "react"
import { Card, CardContent,  CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Key } from "lucide-react"
import { PageLayout } from "@/components/page-layout"
import { toast } from "sonner"
import { getDashboardAuthHeader } from "@/lib/auth"

interface ApiKey {
  id: string
  name: string
  key: string
  role: string
  createdAt: string
  lastUsedAt?: string
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-500",
  operator: "bg-blue-500/10 text-blue-500",
  viewer: "bg-green-500/10 text-green-500",
}

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newKey, setNewKey] = useState("")
  const [formData, setFormData] = useState({ name: "", role: "operator" })

  useEffect(() => { loadKeys() }, [])

  async function loadKeys() {
    setLoading(true)
    try {
      const auth = getDashboardAuthHeader()
      const res = await fetch("/api/apikeys", {
        headers: { "x-api-key": "waha", ...(auth ? { Authorization: `Basic ${auth}` } : {}) },
      })
      if (res.ok) setKeys(await res.json())
    } catch { toast.error("Failed to load API keys") }
    setLoading(false)
  }

  async function createKey() {
    if (!formData.name.trim()) { toast.error("Name is required"); return }
    try {
      const auth = getDashboardAuthHeader()
      const res = await fetch("/api/apikeys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "waha", ...(auth ? { Authorization: `Basic ${auth}` } : {}) },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        const data = await res.json()
        setNewKey(data.key || data.token || "")
        toast.success("API key created")
        loadKeys()
      } else {
        const err = await res.json().catch(() => ({ message: "Request failed" }))
        toast.error(err.message || `Failed to create key (${res.status})`)
      }
    } catch { toast.error("Failed to create API key") }
  }

  async function revokeKey(id: string) {
    try {
      const auth = getDashboardAuthHeader()
      await fetch(`/api/apikeys/${id}`, {
        method: "DELETE",
        headers: { "x-api-key": "waha", ...(auth ? { Authorization: `Basic ${auth}` } : {}) },
      })
      toast.success("API key revoked")
      loadKeys()
    } catch (err) { toast.error("Failed to revoke API key") }
  }

  return (
    <PageLayout title="API Keys" description="Manage API keys for authentication and access control" actions={
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button onClick={() => { setNewKey(""); setFormData({ name: "", role: "operator" }) }}>
            <Plus className="h-5 w-5 mr-2" />New API Key
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>Generate a new API key for authentication</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="My API Key" /></div>
            <div><Label>Role</Label>
              <Select value={formData.role} onValueChange={v => setFormData({ ...formData, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                  <SelectItem value="operator">Operator (read + write)</SelectItem>
                  <SelectItem value="viewer">Viewer (read only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newKey && (
              <div className="p-3 bg-muted rounded-lg">
                <Label>Your API Key (copy now — it won't be shown again)</Label>
                <code className="block mt-2 text-xs font-mono break-all">{newKey}</code>
                <Button size="sm" className="mt-2" onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied!") }}>Copy</Button>
              </div>
            )}
            <Button onClick={createKey} className="w-full">Create Key</Button>
          </div>
        </DialogContent>
      </Dialog>
    }>
      <div className="space-y-6">

      <Card>
        <CardHeader><CardTitle className="text-sm">Active Keys ({keys.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-base text-muted-foreground">No API keys created yet</div>
          ) : (
            <div className="space-y-2">
              {keys.map(key => (
                <div key={key.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium text-sm">{key.name}</span>
                      <p className="text-xs text-base text-muted-foreground">{key.key.slice(0, 8)}...{key.key.slice(-4)}</p>
                    </div>
                    <Badge className={`${ROLE_COLORS[key.role] || ""} text-xs`}>{key.role}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {key.lastUsedAt && <span className="text-xs text-base text-muted-foreground">Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                    <Button size="sm" variant="ghost" onClick={() => revokeKey(key.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PageLayout>
  )
}

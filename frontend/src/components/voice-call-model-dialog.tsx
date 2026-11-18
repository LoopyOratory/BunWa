import { useEffect, useState } from "react"
import { toast } from "sonner"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  agentApi,
  type ModelProviderType,
  type ModelRole,
  type ModelRoleSettings,
} from "@/lib/agents-api"

const PROVIDERS: Array<{ value: ModelProviderType; label: string }> = [
  { value: "fish", label: "Fish Audio" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "google", label: "Google" },
  { value: "openai-compatible", label: "GPT / OpenAI-compatible" },
]

const ROLES: Array<{ value: ModelRole; label: string }> = [
  { value: "voice", label: "Voice model" },
  { value: "call", label: "Call model" },
]

export function VoiceCallModelDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [role, setRole] = useState<ModelRole>("voice")
  const [settings, setSettings] = useState<ModelRoleSettings | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [fallbackApiKey, setFallbackApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setApiKey("")
    setFallbackApiKey("")
    setLoading(true)
    agentApi
      .modelRole(role)
      .then((current) => setSettings(current))
      .catch(() => toast.error("Could not load model settings"))
      .finally(() => setLoading(false))
  }, [open, role])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const next = await agentApi.updateModelRole(role, {
        provider: settings.provider,
        baseUrl: settings.baseUrl,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        model: settings.model,
        fallbackProvider: settings.fallbackProvider,
        fallbackBaseUrl: settings.fallbackBaseUrl,
        fallbackApiKey: fallbackApiKey.trim() ? fallbackApiKey.trim() : undefined,
        fallbackModel: settings.fallbackModel,
      })
      setSettings(next)
      setApiKey("")
      setFallbackApiKey("")
      toast.success("Model settings saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save model settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Voice &amp; call models</DialogTitle>
          <DialogDescription>
            Choose which role to configure, then pick the provider, model, and fallback model BunWa should use.
          </DialogDescription>
        </DialogHeader>

        {loading || !settings ? (
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="model-role">What do you want to configure?</Label>
              <Select value={role} onValueChange={(value) => setRole(value as ModelRole)}>
                <SelectTrigger id="model-role" className="w-full">
                  <SelectValue placeholder="Pick a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary model</p>
              <div className="space-y-2">
                <Label htmlFor="voice-provider">Provider</Label>
                <Select
                  value={settings.provider}
                  onValueChange={(provider) => setSettings({ ...settings, provider: provider as ModelProviderType })}
                >
                  <SelectTrigger id="voice-provider" className="w-full">
                    <SelectValue placeholder="Pick a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voice-base-url">Base URL</Label>
                  <Input
                    id="voice-base-url"
                    value={settings.baseUrl}
                    onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                    placeholder="https://api.fish.audio/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-api-key">API key</Label>
                  <Input
                    id="voice-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={settings.hasApiKey ? "Leave blank to keep the current key" : "Paste the provider API key"}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="voice-model">Model</Label>
                  <Input
                    id="voice-model"
                    value={settings.model}
                    onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                    placeholder="s2.1-pro"
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fallback model</p>
              <div className="space-y-2">
                <Label htmlFor="voice-fallback-provider">Fallback provider</Label>
                <Select
                  value={settings.fallbackProvider}
                  onValueChange={(provider) => setSettings({ ...settings, fallbackProvider: provider as ModelProviderType })}
                >
                  <SelectTrigger id="voice-fallback-provider" className="w-full">
                    <SelectValue placeholder="Pick a fallback provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voice-fallback-base-url">Fallback base URL</Label>
                  <Input
                    id="voice-fallback-base-url"
                    value={settings.fallbackBaseUrl}
                    onChange={(event) => setSettings({ ...settings, fallbackBaseUrl: event.target.value })}
                    placeholder="https://api.elevenlabs.io/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-fallback-api-key">Fallback API key</Label>
                  <Input
                    id="voice-fallback-api-key"
                    type="password"
                    value={fallbackApiKey}
                    onChange={(event) => setFallbackApiKey(event.target.value)}
                    placeholder={settings.hasFallbackApiKey ? "Leave blank to keep the current key" : "Paste the fallback API key"}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="voice-fallback-model">Fallback model</Label>
                  <Input
                    id="voice-fallback-model"
                    value={settings.fallbackModel}
                    onChange={(event) => setSettings({ ...settings, fallbackModel: event.target.value })}
                    placeholder="flash"
                  />
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <Button onClick={save} disabled={saving || !settings}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

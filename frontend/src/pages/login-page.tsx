import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Braces, Loader2, Webhook, Zap, type LucideIcon } from "lucide-react"
import { useAuth } from "@/lib/auth"

// Short, verifiable capability lines (README: dual engine, HMAC webhooks, MCP).
const FACTS: { icon: LucideIcon; text: string }[] = [
  { icon: Zap, text: "Two engines: NOWEB (Baileys) and WEBJS (Chrome)" },
  { icon: Webhook, text: "Webhooks signed with HMAC" },
  { icon: Braces, text: "MCP server at POST /mcp" },
]

export function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const ok = await login(username, password)
      if (!ok) {
        setError("Sign in failed. Check the username and password.")
      }
    } catch {
      setError("Sign in failed. Check the username and password.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-16">
        {/* Sign-in card. First in the DOM so small screens keep an h1; second visually. */}
        <Card className="order-1 w-full max-w-sm animate-scale-in justify-self-center rounded-lg border-border bg-card shadow-lg hover:shadow-lg md:order-2 md:justify-self-end">
          <CardHeader className="space-y-4">
            <img src="/logo.jpg" alt="" aria-hidden className="size-12 rounded-lg object-cover" />
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">Sign in</h1>
              <p className="mt-1 text-xs/relaxed text-muted-foreground">Use your dashboard credentials.</p>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="animate-slide-up">
                  <AlertCircle className="size-4" strokeWidth={1.75} />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Marketing panel: brand, one value line, three facts. */}
        <div className="order-2 hidden md:order-1 md:flex md:flex-col md:gap-8 md:border-r md:border-border/70 md:pr-16">
          <div className="flex items-center gap-3">
            <img src="/logo.jpg" alt="" aria-hidden className="size-10 rounded-lg object-cover" />
            <span className="font-heading text-lg font-semibold tracking-tight">BunWa</span>
          </div>
          <div>
            <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">
              WhatsApp automation for the Bun runtime.
            </h2>
            <p className="mt-3 max-w-sm text-muted-foreground">
              Multi-session messaging, webhooks, and an MCP server in one self-hosted console.
            </p>
          </div>
          <ul className="space-y-3">
            {FACTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <Icon className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

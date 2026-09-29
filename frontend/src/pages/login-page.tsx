import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Braces, Eye, EyeOff, Loader2, Webhook, Zap, type LucideIcon } from "lucide-react"
import { Aurora } from "@/components/dream"
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
  const [showPassword, setShowPassword] = useState(false)
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
      {/* The same dreamscape sky as the console, behind everything. */}
      <Aurora />

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-16">
        {/* Sign-in card. First in the DOM so small screens keep an h1; second visually. */}
        <Card className="order-1 w-full max-w-sm animate-pop-in justify-self-center glass-frost md:order-2 md:justify-self-end">
          <CardHeader className="space-y-4">
            <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent ring-1 ring-primary/30 shadow-[0_12px_34px_-14px_var(--primary)]">
              <img src="/logo.jpg" alt="" aria-hidden className="size-11 rounded-2xl object-cover" />
            </div>
            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-tight">Welcome back</h1>
              <p className="mt-1 text-xs/relaxed text-muted-foreground">
                Use your dashboard credentials. Your sessions are waiting.
              </p>
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pe-9"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary-soft hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-3.5" strokeWidth={1.75} />
                    ) : (
                      <Eye className="size-3.5" strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
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
        <div className="order-2 hidden md:order-1 md:flex md:flex-col md:gap-8 md:pr-16">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt=""
              aria-hidden
              className="size-11 rounded-2xl object-cover shadow-md ring-1 ring-primary/30"
            />
            <span className="font-heading text-xl font-semibold tracking-tight">
              Bun<span className="text-primary">Wa</span>
            </span>
          </div>
          <div>
            <h2 className="font-heading text-4xl font-semibold tracking-tight text-balance">
              WhatsApp automation{" "}
              <span className="text-gradient">with a little sparkle</span>.
            </h2>
            <p className="mt-3 max-w-sm text-muted-foreground">
              Multi-session messaging, webhooks, and an MCP server in one self-hosted console.
            </p>
          </div>
          <ul className="space-y-3">
            {FACTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="icon-chip size-8 [&>svg]:size-4">
                  <Icon strokeWidth={1.75} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

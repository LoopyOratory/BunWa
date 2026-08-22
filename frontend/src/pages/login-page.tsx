import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import { useAuth } from "@/lib/auth"

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
        setError("Invalid credentials")
      }
    } catch {
      setError("Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="hidden md:flex flex-col justify-between absolute inset-y-0 left-0 w-1/2 p-10 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="BunWa" className="size-10 rounded-xl object-cover shadow-md" />
          <span className="font-heading text-lg font-bold tracking-tight">BunWa</span>
        </div>
        <div>
          <h2 className="font-heading text-3xl font-bold tracking-tight leading-tight text-balance">
            WhatsApp automation,<br />the Bun way.
          </h2>
          <p className="mt-3 text-muted-foreground max-w-sm">
            Multi-session messaging, webhooks, and an MCP server. Fast, self-hosted, yours.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">BunWa &middot; Bun + Hono edition</p>
      </div>
      <Card className="w-full max-w-sm animate-scale-in shadow-xl md:ml-auto relative z-10">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl">
            <img src="/logo.jpg" alt="BunWa" className="size-14 rounded-xl object-cover" />
          </div>
          <div>
            <CardTitle className="font-heading text-xl tracking-tight">BunWa Dashboard</CardTitle>
            <CardDescription className="mt-1">Sign in to manage your WhatsApp sessions</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="animate-slide-up">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="loading-spinner size-4" />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

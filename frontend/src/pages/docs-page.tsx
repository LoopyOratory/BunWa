/**
 * BunWa Dashboard — Documentation Page
 * Shows feature descriptions, engine comparisons, and API usage examples.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  MessageCircle,
  Users,
  Radio,
  CircleDot,
  Zap,
  Shield,
  Globe,
  Database,
  Code,
  Server,
  Lock,
  Smartphone,
} from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function DocsPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-10 flex items-center px-6 py-3 border-b bg-background/80 backdrop-blur-sm">
        <SidebarTrigger className="md:hidden" />
        <span className="text-sm font-medium text-muted-foreground">Documentation</span>
      </div>
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-16">
          <div className="mb-8">
            <img src="/logo.jpg" alt="BunWa" className="size-28 rounded-2xl object-cover shadow-lg" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            BunWa
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            WhatsApp HTTP API powered by Bun runtime. A blazing-fast, 1:1 API-compatible
            rewrite of WAHA Bun with Hono framework.
          </p>
          <div className="flex gap-2 mt-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
              <Zap className="size-3" /> Bun Runtime
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-500">
              <Server className="size-3" /> Hono Framework
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-500">
              <Shield className="size-3" /> 100% API Compatible
            </span>
          </div>
        </div>

        {/* Features */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="size-5 text-emerald-500" /> Messaging
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Send text, images, videos, files, voice messages, locations, polls,
                contacts, buttons, lists, and link previews.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="size-5 text-blue-500" /> Groups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create groups, manage participants, set descriptions,
                get invite codes, and control admin permissions.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Radio className="size-5 text-purple-500" /> Channels
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                List channels, follow/unfollow, mute/unmute,
                search by text or view, and preview channel messages.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleDot className="size-5 text-amber-500" /> Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Post text, image, video, and voice statuses.
                Delete statuses and get new message IDs.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="size-5 text-cyan-500" /> Storage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                SQLite persistent store with bun:sqlite. In-memory store
                for development. File-based auth with multi-file state.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="size-5 text-red-500" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                API key authentication, session isolation,
                SSRF guard, HMAC webhook signing, and encrypted media.
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-12" />

        {/* Architecture */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">Architecture</h2>
        <div className="space-y-4 mb-12">
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Code className="size-5 text-emerald-500" /> Stack
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
              <li><strong>Runtime:</strong> Bun (drop-in Node.js replacement)</li>
              <li><strong>Framework:</strong> Hono (lightweight, ultrafast)</li>
              <li><strong>WhatsApp NOWEB:</strong> Baileys (@whiskeysockets/baileys)</li>
              <li><strong>WhatsApp WEBJS:</strong> whatsapp-web.js + Chrome/Puppeteer</li>
              <li><strong>Storage:</strong> bun:sqlite + file-based auth</li>
              <li><strong>DI:</strong> tsyringe for dependency injection</li>
              <li><strong>MCP:</strong> Model Context Protocol at POST /mcp</li>
            </ul>
          </div>
        </div>

        <Separator className="my-12" />

        {/* Engine Support */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">Engine Support</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          <Card className="border-blue-500/30">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="size-5 text-blue-500" /> NOWEB (Baileys)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Lightweight — No browser required, ~100MB RAM per session</p>
              <p>Channels and Newsletters fully supported</p>
              <p>HTTP/SOCKS proxy via HttpsProxyAgent</p>
              <p>Limited history backfill (3 months or 1 year)</p>
              <p>Reverse-engineered protocol, may break on WA updates</p>
              <p className="mt-2 text-xs">Default engine. No Chrome needed.</p>
            </CardContent>
          </Card>
          <Card className="border-purple-500/30">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="size-5 text-purple-500" /> WEBJS (Chrome)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Stable — Uses real WhatsApp Web via Chrome/Puppeteer</p>
              <p>Full chat history via Chrome</p>
              <p>Browser screenshot available</p>
              <p>Proxy via Chrome --proxy-server argument</p>
              <p>~300MB per session (Chrome overhead)</p>
              <p>Channels limited support</p>
              <p className="mt-2 text-xs">Requires /usr/bin/google-chrome or CHROME_PATH</p>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-12" />

        {/* Phone Pairing */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">Phone Pairing</h2>
        <Card className="mb-12">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="size-5 text-emerald-500" /> Pairing Code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Instead of scanning a QR code, enter your phone number to receive a pairing code.
              Works with both NOWEB and WEBJS engines. The session must be in SCAN_QR_CODE status.
            </p>
            <div className="rounded-lg bg-muted p-4 font-mono text-xs space-y-1">
              <p className="text-muted-foreground text-xs">Request a pairing code:</p>
              <p className="break-all">{'curl -X POST http://localhost:3000/api/my-session/auth/request-code'}</p>
              <p>{'  -H "Content-Type: application/json"'}</p>
              <p>{'  -d \'{"phoneNumber":"233501234567"}\''}</p>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-12" />

        {/* Proxy */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">Proxy Configuration</h2>
        <Card className="mb-12">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="size-5 text-amber-500" /> Session Proxy
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>Configure per-session proxy for routing WhatsApp traffic. Supported URL schemes:</p>
            <ul className="list-disc ml-6 space-y-1">
              <li><code className="rounded bg-muted px-1">http://proxy:8080</code> — HTTP CONNECT</li>
              <li><code className="rounded bg-muted px-1">https://proxy:8443</code> — HTTPS CONNECT</li>
              <li><code className="rounded bg-muted px-1">socks4://host:1080</code> — SOCKS4</li>
              <li><code className="rounded bg-muted px-1">socks5://user:pass@host:1080</code> — SOCKS5</li>
            </ul>
            <p className="text-xs">NOWEB uses HttpsProxyAgent/SocksProxyAgent. WEBJS passes --proxy-server to Chrome.</p>
          </CardContent>
        </Card>

        <Separator className="my-12" />

        {/* MCP */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">MCP Server</h2>
        <Card className="mb-12">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="size-5 text-purple-500" /> Model Context Protocol
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              BunWa exposes a Model Context Protocol server at <code className="rounded bg-muted px-1">POST /mcp</code>.
              AI agents can send messages, manage sessions, and interact with WhatsApp programmatically
              using JSON-RPC over HTTP.
            </p>
            <div className="rounded-lg bg-muted p-4 font-mono text-xs space-y-1">
              <p className="text-muted-foreground text-xs">Example MCP call (send_text tool):</p>
              <p className="break-all">{'curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" -H "x-api-key: *** -d \'{"jsonrpc":"2.0","method":"tools/call","params":{"name":"send_text","arguments":{"session":"my-session","chatId":"233501234567@c.us","text":"Hello from MCP"}},"id":1}\''}</p>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-12" />

        {/* Quick Start */}
        <h2 className="text-3xl font-bold tracking-tight mb-6">Quick Start</h2>
        <div className="rounded-lg bg-muted p-6 font-mono text-sm">
          <p className="text-muted-foreground mb-2"># Install dependencies</p>
          <p className="mb-4">bun install</p>
          <p className="text-muted-foreground mb-2"># Start the server</p>
          <p className="mb-4">bun run src/main.ts</p>
          <p className="text-muted-foreground mb-2"># Create a NOWEB session</p>
          <p className="mb-4">curl -X POST http://localhost:3000/api/sessions {'{'}"name": "my-session"{'}'}</p>
          <p className="text-muted-foreground mb-2"># Create a WEBJS session</p>
          <p className="mb-4">curl -X POST http://localhost:3000/api/sessions {'{'}"name": "my-webjs", "config": {'{'}"engine": "webjs"{'}'}{'}'}</p>
          <p className="text-muted-foreground mb-2"># Start the session</p>
          <p>curl -X POST http://localhost:3000/api/sessions/my-session/start</p>
        </div>

        <Separator className="my-12" />

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>BunWa — Built with Bun + Hono + Baileys + whatsapp-web.js</p>
          <p className="mt-1">100% API compatible with WAHA Bun (WhatsApp HTTP API)</p>
        </div>
      </div>
    </div>
  )
}

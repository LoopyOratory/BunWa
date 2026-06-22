import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
} from "lucide-react"

export function DocsPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero with Bun Logo */}
        <div className="flex flex-col items-center text-center mb-16">
          <div className="mb-8">
            <svg viewBox="0 0 1024 1024" className="size-32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="512" cy="512" r="512" fill="#142120" />
              <path d="M512 192c-176.73 0-320 143.27-320 320s143.27 320 320 320 320-143.27 320-320-143.27-320-320-320zm0 576c-141.38 0-256-114.62-256-256s114.62-256 256-256 256 114.62 256 256-114.62 256-256 256z" fill="#4ade80" />
              <path d="M512 288c-123.71 0-224 100.29-224 224s100.29 224 224 224 224-100.29 224-224-100.29-224-224-224zm0 384c-88.37 0-160-71.63-160-160s71.63-160 160-160 160 71.63 160 160-71.63 160-160 160z" fill="#4ade80" />
              <path d="M512 384c-70.69 0-128 57.31-128 128s57.31 128 128 128 128-57.31 128-128-57.31-128-128-128zm0 192c-35.35 0-64-28.65-64-64s28.65-64 64-64 64 28.65 64 64-28.65 64-64 64z" fill="#4ade80" />
              <circle cx="512" cy="512" r="32" fill="#4ade80" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            WAHA <span className="text-emerald-500">Bun</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            WhatsApp HTTP API powered by Bun runtime. A blazing-fast, 1:1 API-compatible
            rewrite of WAHA with Hono framework.
          </p>
          <div className="flex gap-2 mt-6">
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500">
              <Zap className="size-3 mr-1" /> Bun Runtime
            </Badge>
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">
              <Server className="size-3 mr-1" /> Hono Framework
            </Badge>
            <Badge variant="secondary" className="bg-purple-500/10 text-purple-500">
              <Shield className="size-3 mr-1" /> 100% API Compatible
            </Badge>
          </div>
        </div>

        {/* Features Grid */}
        <h2 className="text-2xl font-bold mb-6">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="size-5 text-emerald-500" />
                Messaging
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
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="size-5 text-blue-500" />
                Groups
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
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Radio className="size-5 text-purple-500" />
                Channels
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
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CircleDot className="size-5 text-amber-500" />
                Status
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
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="size-5 text-cyan-500" />
                Storage
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
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="size-5 text-red-500" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                API key authentication, session isolation,
                encrypted media, and secure WebSocket connections.
              </p>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-12" />

        {/* Architecture */}
        <h2 className="text-2xl font-bold mb-6">Architecture</h2>
        <div className="space-y-4 mb-12">
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Code className="size-4 text-emerald-500" /> Stack
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
              <li><strong>Runtime:</strong> Bun (drop-in Node.js replacement)</li>
              <li><strong>Framework:</strong> Hono (lightweight, ultrafast)</li>
              <li><strong>WhatsApp:</strong> Baileys (@whiskeysockets/baileys)</li>
              <li><strong>Storage:</strong> bun:sqlite + file-based auth</li>
              <li><strong>DI:</strong> tsyringe for dependency injection</li>
              <li><strong>Validation:</strong> Zod schemas</li>
            </ul>
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Globe className="size-4 text-blue-500" /> API Endpoints
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
              <div>
                <p className="font-medium text-foreground">Sessions</p>
                <ul className="ml-4 list-disc">
                  <li>CRUD operations</li>
                  <li>Start/Stop/Restart</li>
                  <li>QR code generation</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Messaging</p>
                <ul className="ml-4 list-disc">
                  <li>Send all message types</li>
                  <li>Edit/Delete/Pin/Star</li>
                  <li>Reactions & Replies</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Contacts</p>
                <ul className="ml-4 list-disc">
                  <li>List & Search</li>
                  <li>Check number exists</li>
                  <li>Block/Unblock</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Groups & Channels</p>
                <ul className="ml-4 list-disc">
                  <li>Full CRUD</li>
                  <li>Participant management</li>
                  <li>Follow/Mute channels</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-12" />

        {/* Quick Start */}
        <h2 className="text-2xl font-bold mb-6">Quick Start</h2>
        <div className="rounded-lg bg-muted p-6 font-mono text-sm">
          <p className="text-muted-foreground mb-2"># Install dependencies</p>
          <p className="mb-4">bun install</p>
          <p className="text-muted-foreground mb-2"># Start the server</p>
          <p className="mb-4">bun run src/main.ts</p>
          <p className="text-muted-foreground mb-2"># Create a session</p>
          <p className="mb-4">curl -X POST http://localhost:3000/api/sessions {'{'}"name": "my-session"{'}'}</p>
          <p className="text-muted-foreground mb-2"># Start the session</p>
          <p>curl -X POST http://localhost:3000/api/sessions/my-session/start</p>
        </div>

        <Separator className="my-12" />

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>WAHA Bun — Built with ❤️ using Bun + Hono + Baileys</p>
          <p className="mt-1">100% API compatible with WAHA (WhatsApp HTTP API)</p>
        </div>
      </div>
    </div>
  )
}

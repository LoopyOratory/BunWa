/**
 * BunWa Dashboard: Documentation Page
 * Shows feature descriptions, engine comparisons, and API usage examples.
 */

import type { ReactNode } from "react"
import {
  Braces,
  CircleDot,
  Code,
  Database,
  Globe,
  Lock,
  MessageCircle,
  Radio,
  Server,
  Shield,
  Smartphone,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { DataTable, EngineBadge, SectionHeading } from "@/components/primitives"

/* ── Local building blocks ────────────────────────────────────────────── */

function Pill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
      <Icon className="size-3.5 text-primary" strokeWidth={1.75} />
      {children}
    </span>
  )
}

function CodeBlock({ label, code }: { label?: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {label && (
        <p className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          {label}
        </p>
      )}
      {/* `metric` keeps digits in tabular figures so long URLs stay aligned. */}
      <pre className="metric overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function CommandStep({ step, code }: { step: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <dt className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
        {step}
      </dt>
      <dd>
        <pre className="metric overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed">
          <code>{code}</code>
        </pre>
      </dd>
    </div>
  )
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MessageCircle,
    title: "Messaging",
    body: "Send text, images, videos, files, voice messages, locations, polls, contacts, buttons, lists, and link previews.",
  },
  {
    icon: Users,
    title: "Groups",
    body: "Create groups, manage participants, set descriptions, get invite codes, and control admin permissions.",
  },
  {
    icon: Radio,
    title: "Channels",
    body: "List channels, follow or unfollow, mute or unmute, search by text or view, and preview channel messages.",
  },
  {
    icon: CircleDot,
    title: "Status",
    body: "Post text, image, video, and voice statuses. Delete statuses and get new message IDs.",
  },
  {
    icon: Database,
    title: "Storage",
    body: "SQLite persistent store with bun:sqlite. In-memory store for development. File-based auth with multi-file state.",
  },
  {
    icon: Lock,
    title: "Security",
    body: "API key authentication, session isolation, SSRF guard, HMAC webhook signing, and encrypted media.",
  },
]

const STACK: { term: string; detail: string }[] = [
  { term: "Runtime", detail: "Bun (drop-in Node.js replacement)" },
  { term: "Framework", detail: "Hono (lightweight, ultrafast)" },
  { term: "WhatsApp NOWEB", detail: "Baileys (@whiskeysockets/baileys)" },
  { term: "WhatsApp WEBJS", detail: "whatsapp-web.js + Chrome/Puppeteer" },
  { term: "Storage", detail: "bun:sqlite + file-based auth" },
  { term: "DI", detail: "tsyringe for dependency injection" },
  { term: "MCP", detail: "Model Context Protocol at POST /mcp" },
]

const PROXY_SCHEMES: { url: string; scheme: string }[] = [
  { url: "http://proxy:8080", scheme: "HTTP CONNECT" },
  { url: "https://proxy:8443", scheme: "HTTPS CONNECT" },
  { url: "socks4://host:1080", scheme: "SOCKS4" },
  { url: "socks5://user:pass@host:1080", scheme: "SOCKS5" },
]

export function DocsPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-sm sm:px-6">
        <SidebarTrigger className="md:hidden" />
        <span className="text-sm font-medium text-muted-foreground">Documentation</span>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-14 px-4 py-10 sm:px-6">
        {/* Hero */}
        <header className="text-center">
          <img
            src="/logo.jpg"
            alt=""
            aria-hidden
            className="mx-auto size-20 rounded-lg object-cover shadow-lg"
          />
          <h1 className="mt-6 font-heading text-3xl font-semibold tracking-tight">BunWa</h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            A WhatsApp HTTP API on the Bun runtime, built with Hono, with the same REST surface as
            WAHA Bun.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Pill icon={Zap}>Bun runtime</Pill>
            <Pill icon={Server}>Hono framework</Pill>
            <Pill icon={Shield}>Same REST surface as WAHA</Pill>
          </div>
        </header>

        {/* Features */}
        <section>
          <SectionHeading title="Features" description="What the HTTP API covers." />
          <div className="mt-5 grid gap-x-6 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <div className="flex items-center gap-2.5">
                  <Icon className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
                  <h3 className="font-heading text-sm font-semibold tracking-tight">{title}</h3>
                </div>
                <p className="mt-2 text-xs/relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Architecture */}
        <section>
          <SectionHeading title="Architecture" description="The building blocks behind the server." />
          <dl className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {STACK.map(({ term, detail }) => (
              <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr]">
                <dt className="text-sm font-medium">{term}</dt>
                <dd className="text-sm text-muted-foreground">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Engine support */}
        <section>
          <SectionHeading
            title="Engine support"
            description="Engine choice is per session; NOWEB is the default."
            action={<Code className="size-4 text-primary" strokeWidth={1.75} />}
          />
          <DataTable className="mt-5" minWidthClassName="min-w-[620px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Aspect</TableHead>
                <TableHead>
                  <span className="flex items-center gap-2">
                    <EngineBadge engine="NOWEB" />
                    <span className="text-xs font-normal text-primary">Default</span>
                  </span>
                </TableHead>
                <TableHead>
                  <EngineBadge engine="WEBJS" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Browser process</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">Not required</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">Chrome via Puppeteer</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Channels</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  Fully supported, including newsletters
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">Limited support</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Chat history</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">Limited backfill</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  Full history through WhatsApp Web
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Proxy</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  HTTP/SOCKS via HttpsProxyAgent or SocksProxyAgent
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  Passed to Chrome with --proxy-server
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Requirements</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">No Chrome needed</TableCell>
                <TableCell className="whitespace-normal font-mono text-xs text-muted-foreground">
                  /usr/bin/google-chrome or CHROME_PATH
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Notes</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  Reverse-engineered protocol, may break on WhatsApp updates
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  Stable path using real WhatsApp Web; can capture a browser screenshot
                </TableCell>
              </TableRow>
            </TableBody>
          </DataTable>
        </section>

        {/* Phone pairing */}
        <section>
          <SectionHeading
            title="Phone pairing"
            description="Pair without scanning a QR code."
            action={<Smartphone className="size-4 text-primary" strokeWidth={1.75} />}
          />
          <p className="mt-5 text-sm text-muted-foreground">
            Enter your phone number to receive a pairing code instead of scanning a QR code. Works
            with both NOWEB and WEBJS engines. The session must be in SCAN_QR_CODE status.
          </p>
          <div className="mt-4">
            <CodeBlock
              label="Request a pairing code"
              code={`curl -X POST http://localhost:3000/api/my-session/auth/request-code \\
  -H "Content-Type: application/json" \\
  -d '{"phoneNumber":"233501234567"}'`}
            />
          </div>
        </section>

        {/* Proxy configuration */}
        <section>
          <SectionHeading
            title="Proxy configuration"
            description="Route WhatsApp traffic through a per-session proxy."
            action={<Shield className="size-4 text-primary" strokeWidth={1.75} />}
          />
          <dl className="mt-5 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {PROXY_SCHEMES.map(({ url, scheme }) => (
              <div key={url} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <dt>
                  <code className="metric rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{url}</code>
                </dt>
                <dd className="text-sm text-muted-foreground">{scheme}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            NOWEB uses HttpsProxyAgent/SocksProxyAgent. WEBJS passes --proxy-server to Chrome.
          </p>
        </section>

        {/* MCP server */}
        <section>
          <SectionHeading
            title="MCP server"
            description="Drive sessions from an AI agent over JSON-RPC."
            action={<Braces className="size-4 text-primary" strokeWidth={1.75} />}
          />
          <p className="mt-5 text-sm text-muted-foreground">
            BunWa exposes a Model Context Protocol server at{" "}
            <code className="rounded-md bg-muted px-1 font-mono text-xs">POST /mcp</code>. AI agents
            can send messages, manage sessions, and interact with WhatsApp programmatically using
            JSON-RPC over HTTP.
          </p>
          <div className="mt-4">
            <CodeBlock
              label="Example MCP call (send_text tool)"
              code={`curl -X POST http://localhost:3000/mcp \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ***" \\
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"send_text","arguments":{"session":"my-session","chatId":"233501234567@c.us","text":"Hello from MCP"}},"id":1}'`}
            />
          </div>
        </section>

        {/* Quick start */}
        <section>
          <SectionHeading
            title="Quick start"
            description="From install to a running session."
            action={<Globe className="size-4 text-primary" strokeWidth={1.75} />}
          />
          <dl className="mt-5 space-y-3">
            <CommandStep step="Install dependencies" code="bun install" />
            <CommandStep step="Start the server" code="bun run src/main.ts" />
            <CommandStep
              step="Create a NOWEB session"
              code={`curl -X POST http://localhost:3000/api/sessions {"name": "my-session"}`}
            />
            <CommandStep
              step="Create a WEBJS session"
              code={`curl -X POST http://localhost:3000/api/sessions {"name": "my-webjs", "config": {"engine": "webjs"}}`}
            />
            <CommandStep
              step="Start the session"
              code="curl -X POST http://localhost:3000/api/sessions/my-session/start"
            />
          </dl>
        </section>

        {/* Footer */}
        <footer className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          <p>BunWa, built with Bun, Hono, Baileys, and whatsapp-web.js.</p>
          <p className="mt-1">Same REST surface as WAHA Bun (WhatsApp HTTP API).</p>
        </footer>
      </div>
    </div>
  )
}

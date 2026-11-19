import { useState, type ReactNode } from "react"
import { Braces, Check, Copy, Fish, ShieldCheck, Sparkles, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SHARED_EXAMPLE = `{
  "name": "create_ticket",
  "description": "Open a support ticket when the issue cannot be resolved in conversation.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "subject": { "type": "string", "minLength": 1 },
      "details": { "type": "string" }
    },
    "required": ["subject"],
    "additionalProperties": false
  },
  "http": {
    "method": "POST",
    "url": "https://api.example.com/tickets",
    "bodyTemplate": "{\\"subject\\":\\"{{subject}}\\",\\"details\\":\\"{{details}}\\"}"
  },
  "execution": {
    "mode": "blocking",
    "timeoutSeconds": 20
  }
}`

const FISH_EXAMPLE = `{
  "tool_type": "webhook",
  "name": "create_ticket",
  "description": "Open a support ticket when the issue cannot be resolved.",
  "parameters": { "type": "object", "properties": { ... } },
  "parameter_mode": "strict",
  "method": "POST",
  "url": "https://api.example.com/tickets",
  "body_template": "{\\"subject\\":\\"{{subject}}\\"}",
  "execution_mode": "blocking",
  "timeout_seconds": 20,
  "error_handling": "passthrough",
  "pre_tool_speech": { "mode": "auto" }
}`

const GOOGLE_EXAMPLE = `{
  "name": "create_ticket",
  "description": "Open a support ticket when the issue cannot be resolved.",
  "parametersJsonSchema": { "type": "object", "properties": { ... } },
  "behavior": "BLOCKING",
  "responseJsonSchema": {
    "type": "object",
    "properties": {
      "ok": { "type": "boolean" },
      "speak": { "type": "string" }
    },
    "required": ["ok", "speak"]
  }
}`

const RESPONSE_EXAMPLE = `{
  "ok": true,
  "speak": "Ticket T-1042 is open. Expect a reply within 24 hours.",
  "data": { "ticketId": "T-1042" }
}`

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard can be blocked; the text is still selectable */
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 gap-1.5"
      onClick={copy}
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-6">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{children}</p>
      </div>
    </li>
  )
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-muted/35">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <CopyButton text={code} label={`Copy ${label}`} />
      </div>
      <pre className="max-h-96 overflow-auto p-3 text-[11px] leading-relaxed" aria-label={label}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function ToolSetupGuide({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card">
      <CardHeader className={compact ? "pb-2" : "pb-3"}>
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Workflow className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Tool setup guide</CardTitle>
              <Badge variant="secondary" className="font-normal">Fish + Google</Badge>
            </div>
            <CardDescription className="mt-1">
              One definition, two providers. Fish calls your endpoint; Google sends a function call back to BunWa.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : undefined}>
        <Tabs defaultValue="shared" className="space-y-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="shared">Shared</TabsTrigger>
            <TabsTrigger value="fish">
              <Fish className="mr-1.5 size-3.5" aria-hidden="true" />
              Fish Audio
            </TabsTrigger>
            <TabsTrigger value="google">
              <Sparkles className="mr-1.5 size-3.5" aria-hidden="true" />
              Google Live
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shared" className="mt-0 space-y-3">
            <ul className="space-y-3">
              <Step n={1} title="Name it for the model">
                Use a short snake_case name and a description that says <em>when</em> to use it, not just what it does.
              </Step>
              <Step n={2} title="Define the parameters once">
                Use JSON Schema with snake_case names. Mark only the parameters the model must collect as required.
              </Step>
              <Step n={3} title="Return one envelope">
                Both providers read the same response: a short <code className="text-xs">speak</code> line, structured <code className="text-xs">data</code>, and a clear <code className="text-xs">ok</code> flag.
              </Step>
            </ul>
            <CodeBlock code={SHARED_EXAMPLE} label="canonical tool" />
            <div className="rounded-xl border border-border/70 bg-card/70 p-3">
              <div className="flex items-center gap-2">
                <Braces className="size-4 text-primary" aria-hidden="true" />
                <p className="text-sm font-medium">Response envelope</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Keep it small. Fish uses <code className="text-xs">speak</code> in its next reply; Google receives the same object as a function response.
              </p>
              <CodeBlock code={RESPONSE_EXAMPLE} label="endpoint response" />
            </div>
          </TabsContent>

          <TabsContent value="fish" className="mt-0 space-y-3">
            <ul className="space-y-3">
              <Step n={1} title="Create a workspace webhook tool">
                Fish tools are workspace-level. Create once, then attach the tool to each live agent.
              </Step>
              <Step n={2} title="Use strict parameters">
                Paste the same <code className="text-xs">inputSchema</code> into <code className="text-xs">parameters</code> and keep <code className="text-xs">parameter_mode: strict</code> so a missing value is caught before your endpoint is called.
              </Step>
              <Step n={3} title="Pick the execution mode">
                <strong>blocking</strong> for lookups, <strong>background</strong> for slow work, <strong>fire_and_forget</strong> for logging. Background calls can run up to 300 seconds.
              </Step>
              <Step n={4} title="Use a public URL">
                Fish rejects localhost, private ranges and metadata endpoints. A tunnel is fine for testing.
              </Step>
            </ul>
            <CodeBlock code={FISH_EXAMPLE} label="Fish webhook payload" />
            <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Fish can sign every request with <code className="text-xs">X-Fish-Webhook-Signature</code> (HMAC-SHA256). Verify it before acting on a payment or a booking.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="google" className="mt-0 space-y-3">
            <ul className="space-y-3">
              <Step n={1} title="Send the same schema as parametersJsonSchema">
                This preserves the full JSON Schema. Use the OpenAPI subset only on surfaces that reject <code className="text-xs">parametersJsonSchema</code>.
              </Step>
              <Step n={2} title="Set behavior explicitly">
                <strong>BLOCKING</strong> for payments, bookings and anything irreversible. <strong>NON_BLOCKING</strong> for lookups and background work.
              </Step>
              <Step n={3} title="Handle the tool call in BunWa">
                Gemini Live does not execute tools. BunWa receives the call, validates it, calls your endpoint, and sends a <code className="text-xs">FunctionResponse</code>.
              </Step>
              <Step n={4} title="Schedule the response">
                <code className="text-xs">WHEN_IDLE</code> for a natural pause, <code className="text-xs">SILENT</code> for intermediate results, <code className="text-xs">INTERRUPT</code> only for critical alerts.
              </Step>
            </ul>
            <CodeBlock code={GOOGLE_EXAMPLE} label="Gemini function declaration" />
            <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-card/70 p-3 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Google model support varies: <code className="text-xs">gemini-3.8-live</code> handles sync and async; <code className="text-xs">3.1-flash-live-preview</code> is sync only. Set <code className="text-xs">behavior</code>; don’t rely on defaults.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

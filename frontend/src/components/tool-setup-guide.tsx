import { useState, type ReactNode } from "react"
import { ArrowRight, Braces, Check, Copy, Fish, ShieldCheck, Sparkles, Terminal, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

const SHARED_EXAMPLE = `{
  "name": "create_ticket",
  "description": "Open a support ticket when the issue cannot be resolved.",
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

type Provider = "shared" | "fish" | "google"

function tokenize(line: string): ReactNode {
  const parts = line.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g)
  return parts.map((part, index) => {
    if (!part) return null
    if (/^".*"\s*:$/.test(part)) return <span key={index} className="text-emerald-300">{part}</span>
    if (/^"/.test(part)) return <span key={index} className="text-amber-200">{part}</span>
    if (/^(true|false|null)$/.test(part)) return <span key={index} className="text-sky-300">{part}</span>
    if (/^-?\d/.test(part)) return <span key={index} className="text-fuchsia-300">{part}</span>
    return <span key={index} className="text-emerald-100/70">{part}</span>
  })
}

function CodeLines({ code }: { code: string }) {
  return (
    <div className="min-w-max">
      {code.split("\n").map((line, index) => (
        <div key={index} className="flex">
          <span className="w-8 shrink-0 select-none pr-3 text-right text-emerald-100/20">{index + 1}</span>
          <span className="whitespace-pre">{tokenize(line)}</span>
        </div>
      ))}
    </div>
  )
}

function CopyButton({ text, label, dark = false }: { text: string; label: string; dark?: boolean }) {
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
      variant={dark ? "ghost" : "outline"}
      size="sm"
      className={cn(
        "h-8 gap-1.5 px-2.5 text-[11px]",
        dark && "text-emerald-100/70 hover:bg-white/10 hover:text-emerald-50",
      )}
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
    <li className="relative flex gap-3">
      <span
        aria-hidden="true"
        className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full border border-primary/20 bg-card text-[10px] font-semibold text-primary shadow-sm"
      >
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[13px] font-medium leading-5">{title}</p>
        <p className="text-[13px] leading-5 text-muted-foreground">{children}</p>
      </div>
    </li>
  )
}

function StepList({ children }: { children: ReactNode }) {
  return (
    <ol className="relative space-y-3">
      <span
        aria-hidden="true"
        className="absolute bottom-3 left-3.5 top-3 w-px bg-gradient-to-b from-primary/35 via-border to-transparent"
      />
      {children}
    </ol>
  )
}

function CodePanel({ code, label, tone = "shared" }: { code: string; label: string; tone?: Provider }) {
  const dot = tone === "fish" ? "bg-sky-400" : tone === "google" ? "bg-violet-400" : "bg-emerald-300"

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-300/10 bg-[linear-gradient(180deg,#0a1710,#07120c)] shadow-[0_24px_60px_-30px_rgba(6,78,59,0.55)] ring-1 ring-inset ring-white/5">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.06] text-emerald-200/70 ring-1 ring-inset ring-white/10">
            <Terminal className="size-3.5" aria-hidden="true" />
          </span>
          <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
          <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-100/45">{label}</span>
        </div>
        <CopyButton text={code} label={`Copy ${label}`} dark />
      </div>
      <pre className="max-h-[23rem] flex-1 overflow-auto p-4 text-[11px] leading-[1.7]" aria-label={label}>
        <code><CodeLines code={code} /></code>
      </pre>
      <div className="border-t border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-3.5 text-emerald-300" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100/45">Response envelope</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { field: "ok", type: "boolean" },
            { field: "speak", type: "string" },
            { field: "data", type: "object" },
            { field: "error?", type: "string" },
          ].map(({ field, type }) => (
            <span
              key={field}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-[10px]"
            >
              <span className="text-emerald-100/80">{field}</span>
              <span className="text-emerald-100/30">:</span>
              <span className="text-sky-200/70">{type}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Pipeline({ active }: { active: Provider }) {
  const fishActive = active === "shared" || active === "fish"
  const googleActive = active === "shared" || active === "google"

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/80 p-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Braces className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">BunWa tool</p>
          <p className="truncate text-[10px] text-muted-foreground">name + JSON Schema</p>
        </div>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className={cn(
            "rounded-xl border p-2.5 transition-colors",
            fishActive ? "border-sky-500/30 bg-sky-500/[0.07]" : "border-border/60 bg-card/40 opacity-55",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Fish className={cn("size-3.5", fishActive ? "text-sky-600" : "text-muted-foreground")} aria-hidden="true" />
            <span className="text-xs font-medium">Fish</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Calls your endpoint directly</p>
        </div>
        <div
          className={cn(
            "rounded-xl border p-2.5 transition-colors",
            googleActive ? "border-violet-500/30 bg-violet-500/[0.07]" : "border-border/60 bg-card/40 opacity-55",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Sparkles className={cn("size-3.5", googleActive ? "text-violet-600" : "text-muted-foreground")} aria-hidden="true" />
            <span className="text-xs font-medium">Google</span>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Function call → BunWa executes</p>
        </div>
      </div>
    </div>
  )
}

export function ToolSetupGuide({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="relative overflow-hidden border-primary/20 bg-card/85 shadow-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--primary),transparent_42%)] opacity-[0.10]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]"
      />

      <CardHeader className={cn("relative border-b border-border/60", compact ? "pb-2" : "pb-3")}>
        <div className="flex items-start gap-3">
          <div className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_-14px_var(--primary)]">
            <Workflow className="size-5" aria-hidden="true" />
            <span aria-hidden="true" className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-card bg-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-heading text-lg">Tool setup guide</CardTitle>
              <Badge className="border-primary/20 bg-primary/10 text-primary">2 runtimes</Badge>
            </div>
            <CardDescription className="mt-1 max-w-2xl">
              Define once. Fish calls your endpoint; Google sends a function call back to BunWa.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn("relative", compact ? "pt-3" : "pt-4")}>
        <Tabs defaultValue="shared" className="space-y-4">
          <TabsList aria-label="Tool provider" className="grid w-full grid-cols-3 rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="shared" className="rounded-xl text-xs text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/60">
              <Braces className="mr-1.5 hidden size-3.5 text-primary sm:block" aria-hidden="true" />
              Shared
            </TabsTrigger>
            <TabsTrigger value="fish" className="rounded-xl text-xs text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/60">
              <Fish className="mr-1.5 hidden size-3.5 text-sky-600 sm:block" aria-hidden="true" />
              Fish Audio
            </TabsTrigger>
            <TabsTrigger value="google" className="rounded-xl text-xs text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/60">
              <Sparkles className="mr-1.5 hidden size-3.5 text-violet-600 sm:block" aria-hidden="true" />
              Google Live
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shared" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/55 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">How it runs</p>
                  <Pipeline active="shared" />
                </div>
                <StepList>
                  <Step n={1} title="Name it for the model">
                    Use a short snake_case name and a description that says <em>when</em> to use it.
                  </Step>
                  <Step n={2} title="Define the parameters once">
                    JSON Schema with snake_case names. Mark only what the model must collect as required.
                  </Step>
                  <Step n={3} title="Return one envelope">
                    A short <code className="text-xs">speak</code> line, structured <code className="text-xs">data</code>, and a clear <code className="text-xs">ok</code> flag.
                  </Step>
                </StepList>
              </div>
              <div className="space-y-3">
                <CodePanel code={SHARED_EXAMPLE} label="canonical tool" tone="shared" />
                <div className="flex items-start gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p>
                    <span className="font-medium text-foreground">One response.</span> Fish reads{" "}
                    <code className="text-[10px]">speak</code>; Google gets the same object as a{" "}
                    <code className="text-[10px]">FunctionResponse</code>.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fish" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/55 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">How it runs</p>
                  <Pipeline active="fish" />
                </div>
                <StepList>
                  <Step n={1} title="Create a workspace webhook tool">
                    Create once, then attach it to each live agent.
                  </Step>
                  <Step n={2} title="Use strict parameters">
                    Paste the same <code className="text-xs">inputSchema</code> into <code className="text-xs">parameters</code> and keep <code className="text-xs">parameter_mode: strict</code>.
                  </Step>
                  <Step n={3} title="Pick the execution mode">
                    <strong>blocking</strong> for lookups, <strong>background</strong> for slow work, <strong>fire_and_forget</strong> for logging.
                  </Step>
                  <Step n={4} title="Use a public URL">
                    Fish rejects localhost, private ranges and metadata endpoints. A tunnel is fine for testing.
                  </Step>
                </StepList>
              </div>
              <div className="space-y-3">
                <CodePanel code={FISH_EXAMPLE} label="Fish webhook payload" tone="fish" />
                <div className="flex items-start gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/[0.06] p-3 text-[11px] leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden="true" />
                  <p>
                    Fish can sign every request with <code className="text-[10px]">X-Fish-Webhook-Signature</code>. Verify it before a payment or booking.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="google" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/55 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">How it runs</p>
                  <Pipeline active="google" />
                </div>
                <StepList>
                  <Step n={1} title="Send the same schema">
                    Use <code className="text-xs">parametersJsonSchema</code> to preserve the full JSON Schema.
                  </Step>
                  <Step n={2} title="Set behavior explicitly">
                    <strong>BLOCKING</strong> for payments, bookings and anything irreversible. <strong>NON_BLOCKING</strong> for lookups.
                  </Step>
                  <Step n={3} title="Handle the tool call in BunWa">
                    Gemini Live does not execute tools. BunWa validates, calls your endpoint, and sends a <code className="text-xs">FunctionResponse</code>.
                  </Step>
                  <Step n={4} title="Schedule the response">
                    <code className="text-xs">WHEN_IDLE</code> for a natural pause, <code className="text-xs">SILENT</code> for intermediate results, <code className="text-xs">INTERRUPT</code> only for alerts.
                  </Step>
                </StepList>
              </div>
              <div className="space-y-3">
                <CodePanel code={GOOGLE_EXAMPLE} label="Gemini function declaration" tone="google" />
                <div className="flex items-start gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-3 text-[11px] leading-5 text-muted-foreground">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden="true" />
                  <p>
                    Support varies: <code className="text-[10px]">gemini-3.8-live</code> handles sync and async; <code className="text-[10px]">3.1-flash-live-preview</code> is sync only.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

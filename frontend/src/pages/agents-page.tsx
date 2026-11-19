import { useEffect, useMemo, useState } from "react"
import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import { McpSkillPicker } from "@/components/mcp-skill-picker"
import { ToolSetupGuide } from "@/components/tool-setup-guide"
import { ExternalMcpServersDialog } from "@/components/external-mcp-servers-dialog"
import { KnowledgeChunksDialog } from "@/components/knowledge-chunks-dialog"
import { VoiceCallModelDialog } from "@/components/voice-call-model-dialog"
import { PageLayout } from "@/components/page-layout"
import { EmptyState, ErrorState, SectionHeading } from "@/components/primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  agentApi,
  type Agent,
  type AgentAnalytics,
  type AgentEvent,
  type AgentSkill,
  type BuilderQuestion,
  type KnowledgeSource,
  type McpToolInfo,
  type ModelProbeResult,
  type ModelProviderType,
  type ModelSettings,
} from "@/lib/agents-api"

type DraftSkill = { name: string; description: string; instructions: string; enabled: boolean }
type DraftKnowledge = { name: string; kind: "text" | "file"; content: string; file?: File }

const STEPS = ["Basics", "Prompt", "Skills", "Knowledge", "Tools", "Review"] as const
type Step = (typeof STEPS)[number]

/** Older agents stored the remote tool name; the catalogue now uses a namespaced name. */
function normalizeMcpSelection(selected: string[], tools: McpToolInfo[]) {
  const byRemote = new Map(
    tools.filter((tool) => tool.remoteName).map((tool) => [tool.remoteName as string, tool.name]),
  )
  const normalized = selected.map((name) => byRemote.get(name) ?? name)
  return [...new Set(normalized)]
}

function stepIndex(step: Step) {
  return STEPS.indexOf(step)
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-heading text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: Agent["status"] }) {
  const variant = status === "active" ? "default" : status === "paused" ? "secondary" : "outline"
  return <Badge variant={variant}>{status}</Badge>
}

function AgentCard({ agent, onOpen }: { agent: Agent; onOpen: (agent: Agent) => void }) {
  return (
    <Card className="group cursor-pointer border-border/70 bg-card/70 transition hover:border-primary/40 hover:shadow-lg" onClick={() => onOpen(agent)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Bot className="size-5" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{agent.name}</CardTitle>
              <CardDescription className="truncate">
                {agent.model || "No model set"}
                {agent.fallbackModel ? ` · fallback ${agent.fallbackModel}` : ""}
                {agent.voice ? ` · ${agent.voice}` : ""}
              </CardDescription>
            </div>
          </div>
          <StatusBadge status={agent.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="line-clamp-3 min-h-[3.75rem] text-sm text-muted-foreground">
          {agent.prompt || "No prompt yet. Open the agent to build one."}
        </p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{new Date(agent.updatedAt).toLocaleDateString()}</span>
          <span className="inline-flex items-center gap-1 text-primary opacity-0 transition group-hover:opacity-100">
            Open <ChevronRight className="size-3.5" />
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function BuilderChat({
  messages,
  question,
  answer,
  onAnswerChange,
  onSend,
  onUsePrompt,
  prompt,
  busy,
}: {
  messages: Array<{ role: "assistant" | "user"; text: string }>
  question: BuilderQuestion | null
  answer: string
  onAnswerChange: (value: string) => void
  onSend: () => void
  onUsePrompt: () => void
  prompt: string
  busy: boolean
}) {
  return (
    <div className="flex min-h-[28rem] flex-col rounded-2xl border border-border/70 bg-muted/20">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                message.role === "assistant"
                  ? "bg-card text-foreground shadow-sm"
                  : "ml-auto bg-primary text-primary-foreground"
              }`}
            >
              {message.text}
            </div>
          ))}
          {prompt && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="size-3.5" /> Live prompt preview
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/90">
                {prompt}
              </pre>
            </div>
          )}
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-3">
        {question ? (
          <div className="space-y-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">{question.question}</p>
            {question.hint && <p className="px-1 text-xs text-muted-foreground/70">{question.hint}</p>}
            <div className="flex gap-2">
              <Input
                value={answer}
                onChange={(event) => onAnswerChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    onSend()
                  }
                }}
                placeholder="Type your answer…"
                autoFocus
              />
              <Button onClick={onSend} disabled={!answer.trim() || busy}>
                Send
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-sm text-muted-foreground">The prompt is ready. You can edit it before saving.</p>
            <Button onClick={onUsePrompt} disabled={!prompt}>
              <Check className="size-4" /> Use this prompt
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModelSettingsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [settings, setSettings] = useState<ModelSettings | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [fallbackApiKey, setFallbackApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [results, setResults] = useState<ModelProbeResult[]>([])

  useEffect(() => {
    if (!open) return
    setApiKey("")
    setFallbackApiKey("")
    setResults([])
    setLoading(true)
    agentApi
      .modelSettings()
      .then((current) => setSettings(current))
      .catch(() => toast.error("Could not load model settings"))
      .finally(() => setLoading(false))
  }, [open])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const next = await agentApi.updateModelSettings({
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
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save model settings")
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      const next = await agentApi.testModelSettings()
      setResults(next)
      if (next.every((result) => result.ok)) toast.success("Primary and fallback models responded")
      else if (next.some((result) => result.ok)) toast.warning("One model responded; check the failing one")
      else toast.error("Neither model responded")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not test model settings")
    } finally {
      setTesting(false)
    }
  }

  const providerButton = (value: ModelProviderType, current: ModelProviderType | undefined, onPick: (value: ModelProviderType) => void, label: string) => (
    <Button
      type="button"
      variant={current === value ? "default" : "outline"}
      size="sm"
      onClick={() => onPick(value)}
    >
      {label}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" /> Model provider
          </DialogTitle>
          <DialogDescription>
            Configure the provider BunWa uses for chat and calls, plus the model to fall back to when the primary fails.
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
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary model</p>
              <div className="flex flex-wrap gap-2">
                {providerButton("openai-compatible", settings.provider, (provider) => setSettings({ ...settings, provider }), "OpenAI-compatible")}
                {providerButton("anthropic", settings.provider, (provider) => setSettings({ ...settings, provider }), "Anthropic")}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="model-base-url">Base URL</Label>
                  <Input
                    id="model-base-url"
                    value={settings.baseUrl}
                    onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model-api-key">API key</Label>
                  <Input
                    id="model-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={settings.hasApiKey ? "Leave blank to keep the current key" : "Paste the provider API key"}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="model-name">Model</Label>
                  <Input
                    id="model-name"
                    value={settings.model}
                    onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fallback model</p>
              <div className="flex flex-wrap gap-2">
                {providerButton("openai-compatible", settings.fallbackProvider, (provider) => setSettings({ ...settings, fallbackProvider: provider }), "OpenAI-compatible")}
                {providerButton("anthropic", settings.fallbackProvider, (provider) => setSettings({ ...settings, fallbackProvider: provider }), "Anthropic")}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fallback-base-url">Fallback base URL</Label>
                  <Input
                    id="fallback-base-url"
                    value={settings.fallbackBaseUrl}
                    onChange={(event) => setSettings({ ...settings, fallbackBaseUrl: event.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fallback-api-key">Fallback API key</Label>
                  <Input
                    id="fallback-api-key"
                    type="password"
                    value={fallbackApiKey}
                    onChange={(event) => setFallbackApiKey(event.target.value)}
                    placeholder={settings.hasFallbackApiKey ? "Leave blank to keep the current key" : "Paste the fallback API key"}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fallback-model">Fallback model</Label>
                  <Input
                    id="fallback-model"
                    value={settings.fallbackModel}
                    onChange={(event) => setSettings({ ...settings, fallbackModel: event.target.value })}
                    placeholder="gpt-4o-mini"
                  />
                </div>
              </div>
            </section>

            {results.length > 0 && (
              <section className="space-y-2 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection test</p>
                <div className="space-y-2">
                  {results.map((result) => (
                    <div key={`${result.served}-${result.model}`} className="flex items-start justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {result.served === "primary" ? "Primary" : "Fallback"} · {result.model || "not set"}
                        </p>
                        <p className="text-xs text-muted-foreground">{result.detail}</p>
                      </div>
                      <Badge variant={result.ok ? "default" : "outline"}>{result.ok ? `${result.ms} ms` : "failed"}</Badge>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={test} disabled={testing || !settings}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
              <Button onClick={save} disabled={saving || !settings}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateAgentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<Step>("Basics")
  const [name, setName] = useState("")
  const [model, setModel] = useState("")
  const [fallbackModel, setFallbackModel] = useState("")
  const [voice, setVoice] = useState("")
  const [prompt, setPrompt] = useState("")
  const [promptMode, setPromptMode] = useState<"builder" | "paste">("builder")
  const [questions, setQuestions] = useState<BuilderQuestion[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [answer, setAnswer] = useState("")
  const [messages, setMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([])
  const [skills, setSkills] = useState<DraftSkill[]>([])
  const [knowledge, setKnowledge] = useState<DraftKnowledge[]>([])
  const [skillName, setSkillName] = useState("")
  const [skillInstructions, setSkillInstructions] = useState("")
  const [knowledgeName, setKnowledgeName] = useState("")
  const [knowledgeKind, setKnowledgeKind] = useState<"text" | "file">("text")
  const [knowledgeContent, setKnowledgeContent] = useState("")
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null)
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([])
  const [selectedMcpTools, setSelectedMcpTools] = useState<string[]>([])
  const [reviewEnabled, setReviewEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const currentQuestion = questions[questionIndex] ?? null

  useEffect(() => {
    if (!open) return
    setStep("Basics")
    setName("")
    setModel("")
    setFallbackModel("")
    setVoice("")
    setPrompt("")
    setPromptMode("builder")
    setQuestions([])
    setQuestionIndex(0)
    setAnswers({})
    setAnswer("")
    setMessages([])
    setSkills([])
    setKnowledge([])
    setSkillName("")
    setSkillInstructions("")
    setKnowledgeName("")
    setKnowledgeKind("text")
    setKnowledgeContent("")
    setKnowledgeFile(null)
    setSelectedMcpTools([])
    setReviewEnabled(true)
    setBusy(false)
    setSaving(false)
    void agentApi
      .mcpTools()
      .then((catalog) => setMcpTools(catalog.tools))
      .catch(() => toast.error("Could not load MCP skills"))
    void agentApi
      .builderQuestions()
      .then((list) => {
        setQuestions(list)
        const first = list[0]
        if (first) {
          setMessages([
            { role: "assistant", text: "I’ll help you build the agent prompt. Answer a few short questions." },
            { role: "assistant", text: first.question },
          ])
        }
      })
      .catch(() => toast.error("Could not load the prompt builder"))
  }, [open])

  const goNext = () => {
    const index = stepIndex(step)
    if (index < STEPS.length - 1) setStep(STEPS[index + 1])
  }

  const goBack = () => {
    const index = stepIndex(step)
    if (index > 0) setStep(STEPS[index - 1])
  }

  const sendAnswer = async () => {
    if (!currentQuestion || !answer.trim()) return
    const nextAnswers = { ...answers, [currentQuestion.id]: answer.trim() }
    setAnswers(nextAnswers)
    setMessages((current) => [...current, { role: "user", text: answer.trim() }])
    setAnswer("")
    setBusy(true)
    try {
      const result = await agentApi.builderNext(nextAnswers)
      setPrompt(result.prompt)
      if (result.next) {
        const nextIndex = questions.findIndex((question) => question.id === result.next?.id)
        setQuestionIndex(nextIndex >= 0 ? nextIndex : questionIndex + 1)
        setMessages((current) => [...current, { role: "assistant", text: result.next!.question }])
      } else {
        setQuestionIndex(questions.length)
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "That’s everything I need. I’ve drafted the prompt below — you can edit it." },
        ])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the prompt")
    } finally {
      setBusy(false)
    }
  }

  const addSkill = () => {
    if (!skillName.trim() || !skillInstructions.trim()) {
      toast.error("Give the skill a name and instructions")
      return
    }
    setSkills((current) => [
      ...current,
      { name: skillName.trim(), description: "", instructions: skillInstructions.trim(), enabled: true },
    ])
    setSkillName("")
    setSkillInstructions("")
  }

  const addKnowledge = () => {
    if (knowledgeKind === "text") {
      if (!knowledgeName.trim() || !knowledgeContent.trim()) {
        toast.error("Give the source a name and content")
        return
      }
      setKnowledge((current) => [
        ...current,
        { name: knowledgeName.trim(), kind: "text", content: knowledgeContent.trim() },
      ])
    } else {
      if (!knowledgeFile) {
        toast.error("Choose a document to upload")
        return
      }
      setKnowledge((current) => [
        ...current,
        {
          name: knowledgeName.trim() || knowledgeFile.name.replace(/\.[^.]+$/, ""),
          kind: "file",
          content: "",
          file: knowledgeFile,
        },
      ])
      setKnowledgeFile(null)
    }
    setKnowledgeName("")
    setKnowledgeContent("")
  }

  const create = async () => {
    if (!name.trim()) {
      toast.error("The agent needs a name")
      setStep("Basics")
      return
    }
    setSaving(true)
    try {
      const textKnowledge = knowledge.filter((source) => source.kind === "text")
      const fileKnowledge = knowledge.filter((source) => source.kind === "file" && source.file)
      const created = await agentApi.create({
        name: name.trim(),
        prompt: prompt.trim(),
        model: model.trim() || null,
        fallbackModel: fallbackModel.trim() || null,
        voice: voice.trim() || null,
        settings: {
          reviewEnabled,
          mcp: {
            enabled: selectedMcpTools.length > 0,
            allowedTools: selectedMcpTools,
            deniedTools: [],
            destructiveOps: false,
          },
        },
        skills: skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          enabled: skill.enabled,
        })),
        knowledge: textKnowledge.map((source) => ({
          name: source.name,
          kind: "text" as const,
          content: source.content,
        })),
      })

      let uploaded = 0
      for (const source of fileKnowledge) {
        try {
          await agentApi.uploadKnowledge(created.id, source.file!, source.name)
          uploaded += 1
        } catch (error) {
          toast.error(
            `${source.name}: ${error instanceof Error ? error.message : "could not index the document"}`,
          )
        }
      }
      toast.success(uploaded > 0 ? `Agent created · ${uploaded} document${uploaded === 1 ? "" : "s"} indexed` : "Agent created")
      onOpenChange(false)
      onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the agent")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-hidden p-0">
        <div className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <DialogTitle>Create an agent</DialogTitle>
            <DialogDescription>
              Build the prompt, add skills, and attach knowledge before the agent goes live.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 px-6 py-3">
            {STEPS.map((label, index) => {
              const active = step === label
              const complete = stepIndex(step) > index
              return (
                <div key={label} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStep(label)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : complete
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="grid size-4 place-items-center rounded-full border border-current text-[10px]">
                      {complete ? <Check className="size-2.5" /> : index + 1}
                    </span>
                    {label}
                  </button>
                  {index < STEPS.length - 1 && <ChevronRight className="size-3.5 text-muted-foreground/50" />}
                </div>
              )
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === "Basics" && (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="agent-name">Agent name</Label>
                  <Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Vei’s Support" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-model">Model</Label>
                  <Input id="agent-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gemini-3.8-flash" />
                  <p className="text-xs text-muted-foreground">Leave blank to use the platform default.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-fallback-model">Fallback model</Label>
                  <Input
                    id="agent-fallback-model"
                    value={fallbackModel}
                    onChange={(event) => setFallbackModel(event.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                  <p className="text-xs text-muted-foreground">Used when the primary model fails or times out.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-voice">Voice</Label>
                  <Input id="agent-voice" value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Aoede" />
                  <p className="text-xs text-muted-foreground">Used for live calls when the call agent is enabled.</p>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/20 p-4 md:col-span-2">
                  <div>
                    <p className="text-sm font-medium">Ask for a review before the conversation closes</p>
                    <p className="text-xs text-muted-foreground">Sends a short rating prompt 10 seconds before the session ends. Can be toggled per conversation.</p>
                  </div>
                  <Switch checked={reviewEnabled} onCheckedChange={setReviewEnabled} />
                </div>
              </div>
            )}

            {step === "Prompt" && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant={promptMode === "builder" ? "default" : "outline"} size="sm" onClick={() => setPromptMode("builder")}>
                    <Sparkles className="size-4" /> Build with questions
                  </Button>
                  <Button variant={promptMode === "paste" ? "default" : "outline"} size="sm" onClick={() => setPromptMode("paste")}>
                    <MessageSquare className="size-4" /> Paste a prompt
                  </Button>
                </div>
                {promptMode === "builder" ? (
                  <BuilderChat
                    messages={messages}
                    question={currentQuestion}
                    answer={answer}
                    onAnswerChange={setAnswer}
                    onSend={sendAnswer}
                    onUsePrompt={() => setPromptMode("paste")}
                    prompt={prompt}
                    busy={busy}
                  />
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="agent-prompt">System prompt</Label>
                    <Textarea
                      id="agent-prompt"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      className="min-h-[24rem] font-mono text-xs leading-relaxed"
                      placeholder="You are…"
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the base prompt. Enabled skills are appended automatically when the agent runs.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === "Skills" && (
              <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
                <div className="space-y-3">
                  <SectionHeading title="Add a skill" description="A skill is a focused instruction the agent can use when the task calls for it." />
                  <div className="space-y-2">
                    <Label htmlFor="skill-name">Name</Label>
                    <Input id="skill-name" value={skillName} onChange={(event) => setSkillName(event.target.value)} placeholder="Order lookup" />
                    <p className="text-xs text-muted-foreground">A short label the agent will see.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-instructions">Instructions</Label>
                    <Textarea
                      id="skill-instructions"
                      value={skillInstructions}
                      onChange={(event) => setSkillInstructions(event.target.value)}
                      className="min-h-32"
                      placeholder="Ask for the order number, then check the order table…"
                    />
                    <p className="text-xs text-muted-foreground">Be specific. This text is appended to the prompt when the skill is enabled.</p>
                  </div>
                  <Button onClick={addSkill} className="w-full">
                    <Plus className="size-4" /> Add skill
                  </Button>
                </div>
                <div className="space-y-2">
                  <SectionHeading title={`Skills (${skills.length})`} description="These will be appended to the agent prompt." />
                  {skills.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                      No skills yet.
                    </div>
                  ) : (
                    skills.map((skill, index) => (
                      <div key={`${skill.name}-${index}`} className="rounded-2xl border border-border/70 bg-card/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{skill.name}</p>
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.instructions}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSkills((current) => current.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {step === "Knowledge" && (
              <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
                <div className="space-y-3">
                  <SectionHeading
                    title="Add knowledge"
                    description="Paste text or upload a document. Documents are indexed after the agent is created."
                  />
                  <div className="space-y-2">
                    <Label htmlFor="knowledge-name">Name</Label>
                    <Input id="knowledge-name" value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} placeholder="Refund policy" />
                    <p className="text-xs text-muted-foreground">A label for this source.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant={knowledgeKind === "text" ? "default" : "outline"} size="sm" onClick={() => setKnowledgeKind("text")}>
                      <FileText className="size-4" /> Paste text
                    </Button>
                    <Button variant={knowledgeKind === "file" ? "default" : "outline"} size="sm" onClick={() => setKnowledgeKind("file")}>
                      <Upload className="size-4" /> Upload document
                    </Button>
                  </div>
                  {knowledgeKind === "text" ? (
                    <div className="space-y-2">
                      <Label htmlFor="knowledge-content">Content</Label>
                      <Textarea
                        id="knowledge-content"
                        value={knowledgeContent}
                        onChange={(event) => setKnowledgeContent(event.target.value)}
                        className="min-h-32"
                        placeholder="Paste the source text…"
                      />
                      <p className="text-xs text-muted-foreground">The text is split into chunks and embedded locally.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="knowledge-file">Document</Label>
                      <Input
                        id="knowledge-file"
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json"
                        onChange={(event) => setKnowledgeFile(event.target.files?.[0] ?? null)}
                      />
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX, TXT, Markdown, CSV, or JSON · up to 10 MB. Scanned PDFs need OCR and are not supported yet.
                      </p>
                      {knowledgeFile && (
                        <p className="text-xs text-muted-foreground">
                          Selected: <span className="font-medium text-foreground">{knowledgeFile.name}</span> ·{" "}
                          {(knowledgeFile.size / 1024).toFixed(0)} KB
                        </p>
                      )}
                    </div>
                  )}
                  <Button onClick={addKnowledge} className="w-full">
                    <Plus className="size-4" /> {knowledgeKind === "text" ? "Add text" : "Add document"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    After the agent is created, open its Knowledge tab to inspect every chunk the embedding model made.
                  </p>
                </div>
                <div className="space-y-2">
                  <SectionHeading title={`Knowledge (${knowledge.length})`} description="Sources attached to this agent." />
                  {knowledge.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                      No knowledge sources yet.
                    </div>
                  ) : (
                    knowledge.map((source, index) => (
                      <div key={`${source.name}-${index}`} className="rounded-2xl border border-border/70 bg-card/70 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">{source.name}</p>
                              <Badge variant="outline">{source.kind}</Badge>
                            </div>
                            <p className="mt-1 line-clamp-2 break-all text-xs text-muted-foreground">
                              {source.kind === "file"
                                ? `${source.file?.name ?? "Document"} · indexes when you create the agent`
                                : source.content}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setKnowledge((current) => current.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {step === "Tools" && (
              <div className="space-y-4">
                <ToolSetupGuide compact />
                <SectionHeading
                  title="Tool access"
                  description="Pick the MCP tools this agent may call. The agent can only use what you select here."
                />
                <McpSkillPicker
                  tools={mcpTools}
                  selected={selectedMcpTools}
                  onToggle={(name, checked) =>
                    setSelectedMcpTools((current) =>
                      checked ? [...current, name] : current.filter((tool) => tool !== name),
                    )
                  }
                  onToggleAll={(checked) =>
                    setSelectedMcpTools(checked ? mcpTools.map((tool) => tool.name) : [])
                  }
                  compact
                />
              </div>
            )}

            {step === "Review" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading text-lg font-semibold">{name || "Untitled agent"}</h3>
                    <Badge variant="outline">draft</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {model || "Default model"} {fallbackModel ? `· fallback ${fallbackModel}` : ""} {voice ? `· ${voice}` : ""}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <StatCard label="Skills" value={String(skills.length)} />
                  <StatCard label="Knowledge" value={String(knowledge.length)} />
                  <StatCard label="Tools" value={String(selectedMcpTools.length)} />
                  <StatCard label="Reviews" value={reviewEnabled ? "On" : "Off"} hint="10s before close" />
                </div>
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prompt preview</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {prompt || "No prompt yet. Go back to the Prompt step."}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/70 px-6 py-4">
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <div className="flex gap-2">
                {step !== "Basics" && <Button variant="outline" onClick={goBack}>Back</Button>}
                {step !== "Review" ? (
                  <Button onClick={goNext}>Next <ChevronRight className="size-4" /></Button>
                ) : (
                  <Button onClick={create} disabled={saving}>
                    {saving ? "Creating…" : "Create agent"}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AgentDetailDialog({
  agent,
  onOpenChange,
  onChanged,
}: {
  agent: Agent | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeSource[]>([])
  const [analytics, setAnalytics] = useState<AgentAnalytics | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("")
  const [fallbackModel, setFallbackModel] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skillName, setSkillName] = useState("")
  const [skillInstructions, setSkillInstructions] = useState("")
  const [knowledgeName, setKnowledgeName] = useState("")
  const [knowledgeKind, setKnowledgeKind] = useState<"text" | "file">("text")
  const [knowledgeContent, setKnowledgeContent] = useState("")
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null)
  const [knowledgeBusy, setKnowledgeBusy] = useState(false)
  const [chunksOpen, setChunksOpen] = useState(false)
  const [chunkSource, setChunkSource] = useState<KnowledgeSource | null>(null)
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([])
  const [selectedMcpTools, setSelectedMcpTools] = useState<string[]>([])
  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [agentKey, setAgentKey] = useState<string | null>(null)
  const [agentKeyMeta, setAgentKeyMeta] = useState<{
    hasApiKey: boolean
    canRevealKey: boolean
    prefix: string | null
    createdAt: string | null
  }>({ hasApiKey: false, canRevealKey: false, prefix: null, createdAt: null })
  const [agentKeyBusy, setAgentKeyBusy] = useState(false)

  useEffect(() => {
    if (!agent) return
    setPrompt(agent.prompt)
    setModel(agent.model ?? "")
    setFallbackModel(agent.fallbackModel ?? "")
    setLoading(true)
    Promise.all([
      agentApi.listSkills(agent.id),
      agentApi.listKnowledge(agent.id),
      agentApi.analytics(agent.id),
      agentApi.events({ agentId: agent.id, limit: 20 }),
      agentApi.mcpTools(),
      agentApi.agentMcp(agent.id),
    ])
      .then(([skillList, knowledgeList, stats, eventList, toolCatalog, mcpConfig]) => {
        setSkills(skillList)
        setKnowledge(knowledgeList)
        setAnalytics(stats)
        setEvents(eventList)
        setMcpTools(toolCatalog.tools)
        setSelectedMcpTools(normalizeMcpSelection(mcpConfig.allowedTools, toolCatalog.tools))
        setMcpEnabled(mcpConfig.enabled)
        setAgentKey(null)
        setAgentKeyMeta({
          hasApiKey: mcpConfig.hasApiKey === true,
          canRevealKey: mcpConfig.canRevealKey === true,
          prefix: mcpConfig.apiKeyPrefix ?? null,
          createdAt: mcpConfig.apiKeyCreatedAt ?? null,
        })
      })
      .catch(() => toast.error("Could not load agent details"))
      .finally(() => setLoading(false))
  }, [agent])

  const savePrompt = async () => {
    if (!agent) return
    setSaving(true)
    try {
      await agentApi.update(agent.id, { prompt })
      toast.success("Prompt saved")
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the prompt")
    } finally {
      setSaving(false)
    }
  }

  const saveModel = async () => {
    if (!agent) return
    setSaving(true)
    try {
      await agentApi.update(agent.id, {
        model: model.trim() || null,
        fallbackModel: fallbackModel.trim() || null,
      })
      toast.success("Model settings saved")
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the model settings")
    } finally {
      setSaving(false)
    }
  }

  const saveMcp = async () => {
    if (!agent) return
    setSaving(true)
    try {
      await agentApi.updateAgentMcp(agent.id, {
        enabled: mcpEnabled,
        allowedTools: selectedMcpTools,
        deniedTools: [],
        destructiveOps: false,
      })
      toast.success("MCP skills saved")
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the MCP skills")
    } finally {
      setSaving(false)
    }
  }

  const generateAgentKey = async () => {
    if (!agent) return
    setAgentKeyBusy(true)
    try {
      const result = await agentApi.generateAgentMcpKey(agent.id)
      setAgentKey(result.key)
      setAgentKeyMeta({ hasApiKey: true, canRevealKey: true, prefix: result.prefix, createdAt: result.createdAt })
      toast.success("Agent tool key generated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the agent key")
    } finally {
      setAgentKeyBusy(false)
    }
  }

  const revealAgentKey = async () => {
    if (!agent) return
    setAgentKeyBusy(true)
    try {
      const result = await agentApi.revealAgentMcpKey(agent.id)
      setAgentKey(result.key)
      setAgentKeyMeta((current) => ({ ...current, hasApiKey: true, canRevealKey: true, prefix: result.prefix ?? current.prefix }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reveal the agent key")
    } finally {
      setAgentKeyBusy(false)
    }
  }

  const revokeAgentKey = async () => {
    if (!agent) return
    setAgentKeyBusy(true)
    try {
      await agentApi.deleteAgentMcpKey(agent.id)
      setAgentKey(null)
      setAgentKeyMeta({ hasApiKey: false, canRevealKey: false, prefix: null, createdAt: null })
      toast.success("Agent tool key revoked")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the agent key")
    } finally {
      setAgentKeyBusy(false)
    }
  }

  const addSkill = async () => {
    if (!agent || !skillName.trim() || !skillInstructions.trim()) return
    try {
      const skill = await agentApi.addSkill(agent.id, {
        name: skillName.trim(),
        instructions: skillInstructions.trim(),
      })
      setSkills((current) => [...current, skill])
      setSkillName("")
      setSkillInstructions("")
      toast.success("Skill added")
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the skill")
    }
  }

  const removeSkill = async (skillId: string) => {
    if (!agent) return
    try {
      await agentApi.removeSkill(agent.id, skillId)
      setSkills((current) => current.filter((skill) => skill.id !== skillId))
      toast.success("Skill removed")
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the skill")
    }
  }

  const addKnowledge = async () => {
    if (!agent) return
    if (knowledgeKind === "text" && (!knowledgeName.trim() || !knowledgeContent.trim())) {
      toast.error("Give the source a name and content")
      return
    }
    if (knowledgeKind === "file" && !knowledgeFile) {
      toast.error("Choose a document to upload")
      return
    }
    setKnowledgeBusy(true)
    try {
      const source =
        knowledgeKind === "text"
          ? await agentApi.addKnowledge(agent.id, {
              name: knowledgeName.trim(),
              kind: "text",
              content: knowledgeContent.trim(),
            })
          : await agentApi.uploadKnowledge(
              agent.id,
              knowledgeFile!,
              knowledgeName.trim() || knowledgeFile!.name.replace(/\.[^.]+$/, ""),
            )
      setKnowledge((current) => [...current, source])
      setKnowledgeName("")
      setKnowledgeContent("")
      setKnowledgeFile(null)
      toast.success(
        source.status === "ready"
          ? `Knowledge indexed · ${source.chunkCount} chunk${source.chunkCount === 1 ? "" : "s"}`
          : "Knowledge source added",
      )
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the knowledge source")
    } finally {
      setKnowledgeBusy(false)
    }
  }

  const removeKnowledge = async (sourceId: string) => {
    if (!agent) return
    try {
      await agentApi.removeKnowledge(agent.id, sourceId)
      setKnowledge((current) => current.filter((source) => source.id !== sourceId))
      toast.success("Knowledge source removed")
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the knowledge source")
    }
  }

  return (
    <Dialog open={Boolean(agent)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-hidden p-0">
        <div className="flex max-h-[92dvh] flex-col">
          <DialogHeader className="border-b border-border/70 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {agent?.name}
                  {agent && <StatusBadge status={agent.status} />}
                </DialogTitle>
                <DialogDescription>
                  {agent?.model || "Default model"}
                  {agent?.fallbackModel ? ` · fallback ${agent.fallbackModel}` : ""}
                  {agent?.voice ? ` · ${agent.voice}` : ""}
                </DialogDescription>
              </div>
              {agent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await agentApi.update(agent.id, { status: agent.status === "active" ? "paused" : "active" })
                      toast.success(agent.status === "active" ? "Agent paused" : "Agent activated")
                      onChanged()
                      onOpenChange(false)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not change status")
                    }
                  }}
                >
                  {agent.status === "active" ? "Pause" : "Activate"}
                </Button>
              )}
              {agent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!window.confirm(`Delete ${agent.name}? This removes its skills, knowledge, and conversations.`)) return
                    try {
                      await agentApi.remove(agent.id)
                      toast.success("Agent deleted")
                      onOpenChange(false)
                      onChanged()
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not delete the agent")
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              )}
            </div>
          </DialogHeader>

          <Tabs defaultValue="prompt" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/70 px-6 py-3">
              <TabsList>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="model">Model</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
                <TabsTrigger value="mcp">Tools</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <TabsContent value="prompt" className="mt-0 space-y-3">
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-[24rem] font-mono text-xs leading-relaxed"
                />
                <div className="flex justify-end">
                  <Button onClick={savePrompt} disabled={saving}>{saving ? "Saving…" : "Save prompt"}</Button>
                </div>
              </TabsContent>

              <TabsContent value="model" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="detail-model">Primary model</Label>
                    <Input id="detail-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="gemini-3.8-flash" />
                    <p className="text-xs text-muted-foreground">Leave blank to use the platform default.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="detail-fallback-model">Fallback model</Label>
                    <Input
                      id="detail-fallback-model"
                      value={fallbackModel}
                      onChange={(event) => setFallbackModel(event.target.value)}
                      placeholder="gpt-4o-mini"
                    />
                    <p className="text-xs text-muted-foreground">Used when the primary model fails or times out.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveModel} disabled={saving}>{saving ? "Saving…" : "Save models"}</Button>
                </div>
              </TabsContent>

              <TabsContent value="skills" className="mt-0 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
                <div className="space-y-3">
                  <SectionHeading title="Add a skill" description="Focused instructions appended to the prompt." />
                  <Input value={skillName} onChange={(event) => setSkillName(event.target.value)} placeholder="Skill name" />
                  <Textarea value={skillInstructions} onChange={(event) => setSkillInstructions(event.target.value)} placeholder="Instructions…" className="min-h-28" />
                  <Button onClick={addSkill} className="w-full"><Plus className="size-4" /> Add skill</Button>
                </div>
                <div className="space-y-2">
                  <SectionHeading title={`Skills (${skills.length})`} />
                  {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : skills.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">No skills yet.</p>
                  ) : skills.map((skill) => (
                    <div key={skill.id} className="rounded-2xl border border-border/70 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{skill.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{skill.instructions}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeSkill(skill.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="knowledge" className="mt-0 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
                <div className="space-y-3">
                  <SectionHeading
                    title="Add knowledge"
                    description="Paste text or upload a document. It is chunked and embedded locally with bge-small."
                  />
                  <Input value={knowledgeName} onChange={(event) => setKnowledgeName(event.target.value)} placeholder="Source name" />
                  <div className="flex gap-2">
                    <Button variant={knowledgeKind === "text" ? "default" : "outline"} size="sm" onClick={() => setKnowledgeKind("text")}>
                      <FileText className="size-4" /> Paste text
                    </Button>
                    <Button variant={knowledgeKind === "file" ? "default" : "outline"} size="sm" onClick={() => setKnowledgeKind("file")}>
                      <Upload className="size-4" /> Upload document
                    </Button>
                  </div>
                  {knowledgeKind === "text" ? (
                    <Textarea
                      value={knowledgeContent}
                      onChange={(event) => setKnowledgeContent(event.target.value)}
                      placeholder="Paste text…"
                      className="min-h-28"
                    />
                  ) : (
                    <div className="space-y-2">
                      <Input
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json"
                        onChange={(event) => setKnowledgeFile(event.target.files?.[0] ?? null)}
                      />
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX, TXT, Markdown, CSV, or JSON · up to 10 MB.
                      </p>
                      {knowledgeFile && (
                        <p className="text-xs text-muted-foreground">
                          Selected: <span className="font-medium text-foreground">{knowledgeFile.name}</span>
                        </p>
                      )}
                    </div>
                  )}
                  <Button onClick={addKnowledge} disabled={knowledgeBusy} className="w-full">
                    {knowledgeBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    {knowledgeBusy ? "Chunking and embedding…" : knowledgeKind === "text" ? "Add text" : "Upload and index"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    The document is split into chunks, embedded with the built-in model, and stored in the vector index.
                  </p>
                </div>
                <div className="space-y-2">
                  <SectionHeading title={`Knowledge (${knowledge.length})`} />
                  {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : knowledge.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">No knowledge yet.</p>
                  ) : knowledge.map((source) => (
                    <div key={source.id} className="rounded-2xl border border-border/70 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{source.name}</p>
                            <Badge variant="outline">{source.kind}</Badge>
                            {source.status === "ready" && (
                              <Badge variant="secondary">{source.chunkCount} chunk{source.chunkCount === 1 ? "" : "s"}</Badge>
                            )}
                            {source.status === "processing" && (
                              <Badge variant="outline" className="gap-1">
                                <Loader2 className="size-3 animate-spin" /> Indexing
                              </Badge>
                            )}
                            {source.status === "error" && <Badge variant="destructive">Failed</Badge>}
                          </div>
                          <p className="mt-1 line-clamp-2 break-all text-xs text-muted-foreground">
                            {source.kind === "file"
                              ? String(source.metadata?.fileName ?? source.content.slice(0, 160))
                              : source.content}
                          </p>
                          {source.embeddingModel && (
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              {source.embeddingModel}
                              {source.status === "ready" ? ` · ${source.chunkCount} chunk${source.chunkCount === 1 ? "" : "s"} indexed` : ""}
                            </p>
                          )}
                          {source.status === "error" && source.error && (
                            <p className="mt-1 text-[11px] text-destructive">{source.error}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {source.chunkCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                setChunkSource(source)
                                setChunksOpen(true)
                              }}
                            >
                              View chunks
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => removeKnowledge(source.id)}><Trash2 className="size-4" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {agent && (
                  <KnowledgeChunksDialog
                    agentId={agent.id}
                    sourceId={chunkSource?.id ?? null}
                    sourceName={chunkSource?.name ?? ""}
                    open={chunksOpen}
                    onOpenChange={setChunksOpen}
                  />
                )}
              </TabsContent>

              <TabsContent value="mcp" className="mt-0 space-y-4">
                <ToolSetupGuide compact />
                <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">Agent tool key</p>
                        <Badge variant={agentKeyMeta.hasApiKey ? "secondary" : "outline"}>
                          {agentKeyMeta.hasApiKey ? "issued" : "not issued"}
                        </Badge>
                      </div>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                        Live agents use this key to call the tools selected below. Authentication uses a
                        SHA-256 hash; an encrypted copy is available only to an authenticated admin.
                      </p>
                      {agentKeyMeta.hasApiKey && (
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          {agentKeyMeta.prefix ? `${agentKeyMeta.prefix}…` : "Key issued"}
                          {agentKeyMeta.createdAt ? ` · ${new Date(agentKeyMeta.createdAt).toLocaleString()}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => void generateAgentKey()} disabled={agentKeyBusy}>
                        <KeyRound className="size-4" />
                        {agentKeyMeta.hasApiKey ? "Regenerate key" : "Generate key"}
                      </Button>
                      {agentKeyMeta.hasApiKey && agentKeyMeta.canRevealKey && !agentKey && (
                        <Button variant="outline" size="sm" onClick={() => void revealAgentKey()} disabled={agentKeyBusy}>
                          <Eye className="size-4" />
                          View key
                        </Button>
                      )}
                      {agentKeyMeta.hasApiKey && !agentKeyMeta.canRevealKey && (
                        <span className="text-[11px] text-muted-foreground">Regenerate to enable reveal</span>
                      )}
                      {agentKeyMeta.hasApiKey && (
                        <Button variant="ghost" size="sm" onClick={() => void revokeAgentKey()} disabled={agentKeyBusy}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                  {agentKey && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-muted px-2.5 py-2 font-mono text-xs">
                        {agentKey}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(agentKey)
                          toast.success("Agent key copied")
                        }}
                      >
                        <Copy className="size-4" />
                        Copy
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAgentKey(null)}>
                        Hide
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">MCP access</p>
                    <p className="text-xs text-muted-foreground">
                      The agent can only call the MCP tools selected below.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Enabled</span>
                    <Switch checked={mcpEnabled} onCheckedChange={setMcpEnabled} aria-label="Toggle MCP access" />
                  </div>
                </div>
                <McpSkillPicker
                  tools={mcpTools}
                  selected={selectedMcpTools}
                  onToggle={(name, checked) =>
                    setSelectedMcpTools((current) =>
                      checked ? [...current, name] : current.filter((tool) => tool !== name),
                    )
                  }
                  onToggleAll={(checked) =>
                    setSelectedMcpTools(checked ? mcpTools.map((tool) => tool.name) : [])
                  }
                  compact
                />
                <div className="flex justify-end">
                  <Button onClick={saveMcp} disabled={saving}>{saving ? "Saving…" : "Save MCP skills"}</Button>
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-5">
                  <StatCard label="Conversations" value={String(analytics?.conversations ?? 0)} />
                  <StatCard label="Closed" value={String(analytics?.closedConversations ?? 0)} />
                  <StatCard label="Conversions" value={String(analytics?.conversions ?? 0)} />
                  <StatCard label="Reviews" value={String(analytics?.reviews ?? 0)} />
                  <StatCard
                    label="Avg rating"
                    value={analytics?.averageRating ? analytics.averageRating.toFixed(1) : "—"}
                    hint="1–5"
                  />
                </div>
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Events</p>
                  {(analytics?.events.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No events recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {analytics?.events.map((event) => (
                        <div key={event.type} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{event.type}</span>
                          <span className="font-medium">{event.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-border/70 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent history</p>
                  {events.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No conversation history yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {events.map((event) => (
                        <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{event.type}</p>
                            {event.conversationId && (
                              <p className="truncate text-xs text-muted-foreground">{event.conversationId}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [analytics, setAnalytics] = useState<AgentAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false)
  const [voiceCallOpen, setVoiceCallOpen] = useState(false)
  const [externalMcpOpen, setExternalMcpOpen] = useState(false)
  const [selected, setSelected] = useState<Agent | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, stats] = await Promise.all([agentApi.list(), agentApi.analytics()])
      setAgents(list)
      setAnalytics(stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agents")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const activeCount = useMemo(() => agents.filter((agent) => agent.status === "active").length, [agents])

  return (
    <PageLayout
      title="Agents"
      description="Build the chatbot and call agent, attach skills and knowledge, and track how conversations perform."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setModelSettingsOpen(true)}>
            <KeyRound className="size-4" /> Model provider
          </Button>
          <Button variant="outline" onClick={() => setVoiceCallOpen(true)}>
            Voice &amp; call models
          </Button>
          <Button variant="outline" onClick={() => setExternalMcpOpen(true)}>
            External MCP servers
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New agent
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Agents" value={String(agents.length)} hint={`${activeCount} active`} />
          <StatCard label="Conversations" value={String(analytics?.conversations ?? 0)} />
          <StatCard label="Conversions" value={String(analytics?.conversions ?? 0)} hint={analytics?.conversionRate != null ? `${Math.round(analytics.conversionRate * 100)}% rate` : undefined} />
          <StatCard label="Reviews" value={String(analytics?.reviews ?? 0)} />
          <StatCard
            label="Satisfaction"
            value={analytics?.averageRating ? `${analytics.averageRating.toFixed(1)} / 5` : "—"}
            hint="Average review"
          />
        </div>

        <SectionHeading
          title="Your agents"
          description="Each agent shares its profile, prompt, skills, and knowledge across chat and voice."
          action={
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          }
        />

        {error ? (
          <ErrorState title="Could not load agents" description={error} onRetry={() => void load()} />
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <Card key={item} className="h-48 animate-pulse border-border/70 bg-card/50" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <EmptyState
            icon={<Bot className="size-7" />}
            title="No agents yet"
            description="Create your first agent, then attach skills and knowledge before it starts answering."
            action={<Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Create an agent</Button>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onOpen={setSelected} />
            ))}
          </div>
        )}
      </div>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />
      <ModelSettingsDialog open={modelSettingsOpen} onOpenChange={setModelSettingsOpen} onSaved={() => void load()} />
      <VoiceCallModelDialog open={voiceCallOpen} onOpenChange={setVoiceCallOpen} />
      <ExternalMcpServersDialog
        open={externalMcpOpen}
        onOpenChange={setExternalMcpOpen}
        onServersChanged={() => void load()}
      />
      <AgentDetailDialog agent={selected} onOpenChange={(open) => !open && setSelected(null)} onChanged={() => void load()} />
    </PageLayout>
  )
}

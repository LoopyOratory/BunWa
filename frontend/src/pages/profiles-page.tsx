import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, Plus, RefreshCw, Search, Sparkles, Trash2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { PageLayout } from "@/components/page-layout"
import { EmptyState, ErrorState } from "@/components/primitives"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  agentApi,
  type ProfileContext,
  type ProfileFactKind,
  type ProfileFactSensitivity,
  type UserProfile,
  type UserProfileFact,
  type UserProfileSummary,
  type UserSegment,
} from "@/lib/agents-api"

const FACT_KINDS: Array<{ value: ProfileFactKind; label: string }> = [
  { value: "identity", label: "Identity" },
  { value: "preference", label: "Preference" },
  { value: "constraint", label: "Constraint" },
  { value: "goal", label: "Goal" },
  { value: "relationship", label: "Relationship" },
  { value: "communication", label: "Communication" },
  { value: "other", label: "Other" },
]

const SENSITIVITIES: Array<{ value: ProfileFactSensitivity; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "personal", label: "Personal" },
  { value: "sensitive", label: "Sensitive" },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return "Never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<UserProfile | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProfiles(await agentApi.profiles(200))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profiles")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return profiles
    return profiles.filter((profile) =>
      [profile.displayName, profile.userId, profile.phone, profile.email, ...profile.tags]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [profiles, query])

  return (
    <PageLayout
      title="User profiles"
      description="Evidence-linked profiles the agent can read before it replies. Keep facts small, inspectable, and current."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New profile
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Profiles" value={String(profiles.length)} />
          <StatCard
            label="With tags"
            value={String(profiles.filter((profile) => profile.tags.length > 0).length)}
            hint="Manually classified"
          />
          <StatCard
            label="Seen this month"
            value={String(
              profiles.filter((profile) => {
                if (!profile.lastSeenAt) return false
                return Date.now() - new Date(profile.lastSeenAt).getTime() < 30 * 24 * 60 * 60 * 1000
              }).length,
            )}
          />
          <StatCard
            label="Named"
            value={String(profiles.filter((profile) => Boolean(profile.displayName)).length)}
            hint="Identity known"
          />
        </div>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, user id, or tag"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-32 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : error ? (
          <ErrorState title="Could not load profiles" description={error} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<UserRound className="size-6" />}
            title={profiles.length === 0 ? "No profiles yet" : "No matching profiles"}
            description={
              profiles.length === 0
                ? "Create a profile manually or let a conversation create one, then add facts the agent should remember."
                : "Try a different name, phone number, user id, or tag."
            }
            action={
              profiles.length === 0 ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" /> New profile
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((profile) => (
              <Card
                key={profile.id}
                className="cursor-pointer border-border/70 bg-card/70 transition-colors hover:border-primary/40 hover:bg-card"
                onClick={() => setSelected(profile)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{profile.displayName || "Unnamed user"}</CardTitle>
                      <CardDescription className="mt-1 truncate font-mono text-xs">{profile.userId}</CardDescription>
                    </div>
                    <UserRound className="size-5 shrink-0 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {profile.tags.length > 0 ? (
                      profile.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No tags</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{profile.phone || profile.email || "No contact"}</span>
                    <span>Last seen {formatDate(profile.lastSeenAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateProfileDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false)
          void load()
        }}
      />
      <ProfileDetailDialog
        profile={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onChanged={() => void load()}
      />
    </PageLayout>
  )
}

function CreateProfileDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [userId, setUserId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!userId.trim()) {
      toast.error("User id is required")
      return
    }
    setSaving(true)
    try {
      await agentApi.upsertProfile(userId.trim(), {
        displayName: displayName.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      })
      toast.success("Profile created")
      setUserId("")
      setDisplayName("")
      setPhone("")
      setNotes("")
      onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New profile</DialogTitle>
          <DialogDescription>Use the WhatsApp id or phone number as the user id.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="profile-user-id">User id</Label>
            <Input
              id="profile-user-id"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="233500000000@c.us"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Display name</Label>
              <Input
                id="profile-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Ama"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="233500000000"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-notes">Notes</Label>
            <Textarea
              id="profile-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything the agent should know before the first reply."
              className="min-h-20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create profile"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProfileDetailDialog({
  profile,
  onOpenChange,
  onChanged,
}: {
  profile: UserProfile | null
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [facts, setFacts] = useState<UserProfileFact[]>([])
  const [segments, setSegments] = useState<UserSegment[]>([])
  const [context, setContext] = useState<ProfileContext | null>(null)
  const [summary, setSummary] = useState<UserProfileSummary | null>(null)
  const [summaryDraft, setSummaryDraft] = useState("")
  const [loading, setLoading] = useState(false)
  const [savingSummary, setSavingSummary] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    try {
      const [factList, segmentList, profileContext, profileSummary] = await Promise.all([
        agentApi.profileFacts(profile.userId),
        agentApi.profileSegments(profile.userId),
        agentApi.profileContext(profile.userId),
        agentApi.profileSummary(profile.userId),
      ])
      setFacts(factList)
      setSegments(segmentList)
      setContext(profileContext)
      setSummary(profileSummary)
      setSummaryDraft(profileSummary?.summary ?? "")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load profile details")
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    if (profile) void load()
  }, [profile, load])

  if (!profile) return null

  const refresh = async () => {
    await load()
    onChanged()
  }

  const summarize = async () => {
    try {
      const next = await agentApi.summarizeProfile(profile.userId)
      setSummary(next)
      setSummaryDraft(next.summary)
      toast.success("Summary rebuilt from active facts")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not summarize profile")
    }
  }

  const saveSummary = async () => {
    setSavingSummary(true)
    try {
      const next = await agentApi.upsertProfileSummary(profile.userId, summaryDraft)
      setSummary(next)
      toast.success("Summary saved")
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save summary")
    } finally {
      setSavingSummary(false)
    }
  }

  return (
    <Dialog open={Boolean(profile)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {profile.displayName || "Unnamed user"}
            <Badge variant="outline" className="font-mono text-[10px]">{profile.userId}</Badge>
          </DialogTitle>
          <DialogDescription>
            {profile.phone || profile.email || "No contact"} · Last seen {formatDate(profile.lastSeenAt)}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="facts">Facts ({facts.length})</TabsTrigger>
            <TabsTrigger value="segments">Segments ({segments.length})</TabsTrigger>
            <TabsTrigger value="context">Prompt context</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoCard label="Phone" value={profile.phone || "—"} />
              <InfoCard label="Email" value={profile.email || "—"} />
              <InfoCard label="Timezone" value={profile.timezone || "—"} />
              <InfoCard label="Locale" value={profile.locale || "—"} />
            </div>

            <Card className="border-border/70 bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tags and preferences</CardTitle>
                <CardDescription>Manual classification and durable preferences.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {profile.tags.length > 0 ? profile.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>) : <span className="text-sm text-muted-foreground">No tags</span>}
                </div>
                <Separator />
                <KeyValueList value={profile.preferences} empty="No preferences stored" />
                <Separator />
                <KeyValueList value={profile.importantDetails} empty="No important details stored" />
                {profile.notes && <p className="text-sm text-muted-foreground">{profile.notes}</p>}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Profile summary</CardTitle>
                <CardDescription>Short, inspectable text injected into the agent prompt.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={summaryDraft}
                  onChange={(event) => setSummaryDraft(event.target.value)}
                  className="min-h-28"
                  placeholder="A short summary built from active facts."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={summarize}>
                    <Sparkles className="size-4" /> Rebuild from facts
                  </Button>
                  <Button onClick={saveSummary} disabled={savingSummary}>
                    {savingSummary ? "Saving…" : "Save summary"}
                  </Button>
                  {summary && <span className="text-xs text-muted-foreground">v{summary.version} · {summary.tokenCount} tokens</span>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="facts" className="mt-0 space-y-4">
            <FactExtractor userId={profile.userId} onExtracted={refresh} />
            <FactComposer userId={profile.userId} onCreated={refresh} />
            {loading ? (
              <div className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>
            ) : facts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No active facts yet. Add one above, or let the extraction job write them.
              </p>
            ) : (
              <div className="space-y-2">
                {facts.map((fact) => (
                  <FactRow key={fact.id} fact={fact} userId={profile.userId} onDeleted={refresh} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="segments" className="mt-0 space-y-4">
            <SegmentComposer userId={profile.userId} onCreated={refresh} />
            {segments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No segments yet. Add lifecycle, value, engagement, or communication segments.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {segments.map((segment) => (
                  <Card key={segment.id} className="border-border/70 bg-card/70">
                    <CardContent className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{segment.segmentType}</Badge>
                          <span className="text-sm font-medium">{segment.segmentValue}</span>
                        </div>
                        {segment.reason && <p className="mt-1 text-xs text-muted-foreground">{segment.reason}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          try {
                            await agentApi.deleteProfileSegment(profile.userId, segment.id)
                            toast.success("Segment removed")
                            await refresh()
                          } catch {
                            toast.error("Could not remove segment")
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="context" className="mt-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">This is the block the agent should receive before replying.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(context?.text ?? "")
                  toast.success("Context copied")
                }}
              >
                <Copy className="size-4" /> Copy
              </Button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-xl border border-border/70 bg-muted/40 p-4 text-xs leading-relaxed whitespace-pre-wrap">
              {context?.text || "No context yet."}
            </pre>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm">{value}</p>
      </CardContent>
    </Card>
  )
}

function KeyValueList({ value, empty }: { value: Record<string, unknown>; empty: string }) {
  const entries = Object.entries(value)
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="space-y-1">
      {entries.map(([key, item]) => (
        <div key={key} className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{key}</span>
          <span className="text-right">{valueText(item)}</span>
        </div>
      ))}
    </div>
  )
}

function FactRow({ fact, userId, onDeleted }: { fact: UserProfileFact; userId: string; onDeleted: () => void }) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{fact.kind}</Badge>
            <span className="text-sm font-medium">{fact.key}</span>
            <span className="text-sm">{valueText(fact.value)}</span>
            <Badge variant={fact.confidence >= 0.85 ? "secondary" : "outline"}>
              {Math.round(fact.confidence * 100)}%
            </Badge>
            {fact.sensitivity !== "normal" && <Badge variant="destructive">{fact.sensitivity}</Badge>}
          </div>
          {fact.evidence && <p className="text-xs text-muted-foreground">“{fact.evidence}”</p>}
          <p className="text-[11px] text-muted-foreground">
            {fact.source} · confirmed {formatDate(fact.lastConfirmedAt)}
            {fact.expiresAt ? ` · expires ${formatDate(fact.expiresAt)}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={async () => {
            try {
              await agentApi.deleteProfileFact(userId, fact.id)
              toast.success("Fact removed")
              onDeleted()
            } catch {
              toast.error("Could not remove fact")
            }
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function FactExtractor({ userId, onExtracted }: { userId: string; onExtracted: () => void }) {
  const [text, setText] = useState("")
  const [running, setRunning] = useState(false)

  const extract = async () => {
    const messages = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(user|assistant|system)\s*:\s*(.*)$/i)
        return match ? { role: match[1].toLowerCase(), content: match[2] } : { role: "user", content: line }
      })
    if (messages.length === 0) {
      toast.error("Paste a conversation first")
      return
    }
    setRunning(true)
    try {
      const facts = await agentApi.extractProfileFacts(userId, messages)
      toast.success(facts.length > 0 ? `${facts.length} fact${facts.length === 1 ? "" : "s"} extracted` : "No new durable facts found")
      setText("")
      onExtracted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not extract facts")
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Extract from a conversation</CardTitle>
        <CardDescription>
          Paste messages as <code className="text-xs">user: …</code> lines, or plain text. The configured chat model writes facts; you can edit or remove them after.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"user: I prefer WhatsApp voice notes, not long texts.\nassistant: Got it — I'll keep replies short."}
          className="min-h-28 font-mono text-xs"
        />
        <Button onClick={extract} disabled={running}>
          <Sparkles className="size-4" /> {running ? "Extracting…" : "Extract facts"}
        </Button>
      </CardContent>
    </Card>
  )
}

function FactComposer({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [kind, setKind] = useState<ProfileFactKind>("preference")
  const [key, setKey] = useState("")
  const [value, setValue] = useState("")
  const [confidence, setConfidence] = useState("0.8")
  const [sensitivity, setSensitivity] = useState<ProfileFactSensitivity>("normal")
  const [evidence, setEvidence] = useState("")
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!key.trim() || !value.trim()) {
      toast.error("Key and value are required")
      return
    }
    setSaving(true)
    try {
      await agentApi.createProfileFact(userId, {
        kind,
        key: key.trim(),
        value: value.trim(),
        confidence: Number(confidence) || 0.8,
        sensitivity,
        source: "manual",
        evidence: evidence.trim() || null,
      })
      setKey("")
      setValue("")
      setEvidence("")
      toast.success("Fact added")
      onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add fact")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add a fact</CardTitle>
        <CardDescription>Keep it short, specific, and linked to evidence.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(next) => setKind(next as ProfileFactKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FACT_KINDS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Key</Label>
            <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="tone" />
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="concise" />
          </div>
          <div className="space-y-2">
            <Label>Confidence</Label>
            <Input value={confidence} onChange={(event) => setConfidence(event.target.value)} placeholder="0.8" />
          </div>
          <div className="space-y-2">
            <Label>Sensitivity</Label>
            <Select value={sensitivity} onValueChange={(next) => setSensitivity(next as ProfileFactSensitivity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SENSITIVITIES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label>Evidence</Label>
            <Input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="What the user said" />
          </div>
        </div>
        <Button onClick={add} disabled={saving}>
          <Plus className="size-4" /> {saving ? "Adding…" : "Add fact"}
        </Button>
      </CardContent>
    </Card>
  )
}

function SegmentComposer({ userId, onCreated }: { userId: string; onCreated: () => void }) {
  const [segmentType, setSegmentType] = useState("lifecycle")
  const [segmentValue, setSegmentValue] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!segmentValue.trim()) {
      toast.error("Segment value is required")
      return
    }
    setSaving(true)
    try {
      await agentApi.createProfileSegment(userId, {
        segmentType: segmentType.trim(),
        segmentValue: segmentValue.trim(),
        reason: reason.trim(),
      })
      setSegmentValue("")
      setReason("")
      toast.success("Segment added")
      onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add segment")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Add a segment</CardTitle>
        <CardDescription>Examples: lifecycle, value, engagement, communication.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Type</Label>
            <Input value={segmentType} onChange={(event) => setSegmentType(event.target.value)} placeholder="lifecycle" />
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Input value={segmentValue} onChange={(event) => setSegmentValue(event.target.value)} placeholder="active" />
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label>Reason</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Messaged in the last 14 days" />
          </div>
        </div>
        <Button onClick={add} disabled={saving}>
          <Plus className="size-4" /> {saving ? "Adding…" : "Add segment"}
        </Button>
      </CardContent>
    </Card>
  )
}

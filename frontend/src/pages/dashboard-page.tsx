import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { MessageSquare, Plus, RefreshCw, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageLayout } from "@/components/page-layout"
import { CardGridSkeleton, EmptyState, ErrorState, SectionHeading, Skeleton } from "@/components/primitives"
import { CreateSessionDialog } from "@/components/create-session-dialog"
import { SessionSettingsDialog, type SessionSettingsTab } from "@/components/session-settings-dialog"
import { SessionDetailDialog } from "@/pages/session-detail-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { SystemStrip } from "@/components/dashboard/system-strip"
import { AttentionList } from "@/components/dashboard/attention-list"
import { SessionCard, type SessionAction } from "@/components/dashboard/session-card"
import { sessionSeverity } from "@/lib/session-severity"
import { ActivityPanels } from "@/components/dashboard/activity-panels"
import { useDashboardSummary } from "@/hooks/use-dashboard-summary"
import { api, type AttentionItem, type DashboardRange, type Session } from "@/lib/api"
import { cn } from "@/lib/utils"

const RANGES: DashboardRange[] = ["1h", "24h", "7d", "30d"]
const RANGE_STORAGE_KEY = "bunwa.dashboard.range"

function readStoredRange(): DashboardRange {
  try {
    const stored = localStorage.getItem(RANGE_STORAGE_KEY) as DashboardRange | null
    return stored && RANGES.includes(stored) ? stored : "24h"
  } catch {
    return "24h"
  }
}

type Confirm = { action: "logout" | "delete"; session: string } | null

/**
 * The ops dashboard: what needs attention first, then one card per session
 * (status, limits, failures, actions), then activity over the chosen range.
 * Everything comes from GET /api/dashboard/summary; status changes arrive
 * live over the WebSocket.
 */
export function DashboardPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState<DashboardRange>(readStoredRange)
  const { summary, error, loading, reload } = useDashboardSummary(range)
  const [search, setSearch] = useState("")
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const [showCreate, setShowCreate] = useState(false)
  const [settings, setSettings] = useState<{ session: Session; tab: SessionSettingsTab } | null>(null)
  const [detail, setDetail] = useState<Session | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  // Durations ("Working · 2d") and "active 3 min ago" keep ticking between polls.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(interval)
  }, [])

  const changeRange = (next: DashboardRange) => {
    setRange(next)
    try {
      localStorage.setItem(RANGE_STORAGE_KEY, next)
    } catch {
      /* per-viewer convenience only */
    }
  }

  const sessions = useMemo(() => {
    const list = summary?.sessions ?? []
    const query = search.trim().toLowerCase()
    return list
      .filter((s) => !query || s.name.toLowerCase().includes(query) || s.account?.id.includes(query) || s.account?.pushName?.toLowerCase().includes(query))
      .filter((s) => !problemsOnly || sessionSeverity(s) > 0)
      .sort((a, b) => sessionSeverity(b) - sessionSeverity(a) || a.name.localeCompare(b.name))
  }, [summary, search, problemsOnly])

  const loadSession = async (name: string): Promise<Session | null> => {
    try {
      return await api.getSession(name)
    } catch {
      toast.error(`Could not load ${name}`)
      return null
    }
  }

  const run = (label: string, promise: Promise<unknown>) =>
    promise
      .then(() => {
        toast.success(label)
        void reload()
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : `${label} failed`))

  const openSettings = async (name: string, tab: SessionSettingsTab) => {
    const session = await loadSession(name)
    if (session) setSettings({ session, tab })
  }

  const handleSessionAction = async (name: string, action: SessionAction) => {
    switch (action) {
      case "start":
        return run(`Starting ${name}`, api.startSession(name))
      case "stop":
        return run(`Stopped ${name}`, api.stopSession(name))
      case "restart":
        return run(`Restarting ${name}`, api.restartSession(name))
      case "logout":
      case "delete":
        return setConfirm({ action, session: name })
      case "qr": {
        const session = await loadSession(name)
        if (session) setDetail(session)
        return
      }
      case "chat":
        return navigate(`/sessions/${encodeURIComponent(name)}/chat`)
      case "settings":
        return openSettings(name, "webhooks")
      case "screenshot":
        return run("Screenshot taken", api.getScreenshot(name))
    }
  }

  const handleAttention = (item: AttentionItem) => {
    const name = item.session
    switch (item.action) {
      case "qr":
      case "start":
      case "restart":
        if (name) void handleSessionAction(name, item.action)
        return
      case "limits":
        if (name) void openSettings(name, "sending")
        return
      case "webhooks":
        if (name) void openSettings(name, "webhooks")
        return
      case "logs":
        navigate("/logs")
        return
    }
  }

  const runConfirmed = async () => {
    if (!confirm) return
    const { action, session } = confirm
    if (action === "delete") await run(`Deleted ${session}`, api.deleteSession(session))
    else await run(`Logged out ${session}`, api.logoutSession(session))
  }

  return (
    <PageLayout
      title="Dashboard"
      description={summary ? <SystemStrip server={summary.server} /> : "Session health, limits and delivery"}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-border/70 bg-card/60 p-0.5" role="group" aria-label="Time range">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => changeRange(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  range === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={() => void reload()} title="Refresh" aria-label="Refresh">
            <RefreshCw className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {loading && !summary ? (
          <>
            <Skeleton className="h-14 w-full rounded-lg" />
            <CardGridSkeleton count={3} />
          </>
        ) : error && !summary ? (
          <ErrorState title="Could not load the dashboard" description={error} onRetry={() => void reload()} />
        ) : summary ? (
          <>
            {error && (
              <p className="text-xs text-warning-foreground">Showing the last answer; the latest refresh failed: {error}</p>
            )}
            <AttentionList items={summary.attention} onAction={handleAttention} />

            <section className="space-y-3">
              <SectionHeading
                title="Sessions"
                description={`${summary.sessions.length} session${summary.sessions.length === 1 ? "" : "s"}, problems first`}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    {summary.sessions.length > 3 && (
                      <>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
                          <Input
                            placeholder="Search sessions"
                            aria-label="Search sessions"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-8 w-48 pl-8"
                          />
                        </div>
                        <Button
                          size="sm"
                          variant={problemsOnly ? "default" : "outline"}
                          aria-pressed={problemsOnly}
                          onClick={() => setProblemsOnly((v) => !v)}
                        >
                          Problems only
                        </Button>
                      </>
                    )}
                    <Button size="sm" onClick={() => setShowCreate(true)}>
                      <Plus className="size-4" strokeWidth={1.75} />
                      Create session
                    </Button>
                  </div>
                }
              />
              {summary.sessions.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare strokeWidth={1.75} />}
                  title="Create your first session"
                  description="A session links one WhatsApp account to this server."
                  action={
                    <Button size="sm" onClick={() => setShowCreate(true)}>
                      <Plus className="size-4" strokeWidth={1.75} />
                      Create session
                    </Button>
                  }
                />
              ) : sessions.length === 0 ? (
                <EmptyState
                  icon={<Search strokeWidth={1.75} />}
                  title="No matching sessions"
                  description={problemsOnly ? "No session has a problem right now." : "Adjust the search to see more."}
                  action={
                    <Button variant="outline" size="sm" onClick={() => { setSearch(""); setProblemsOnly(false) }}>
                      Show all sessions
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {sessions.map((session) => (
                    <SessionCard
                      key={session.name}
                      session={session}
                      now={now}
                      onAction={(action) => void handleSessionAction(session.name, action)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <SectionHeading title="Activity" description={`Last ${summary.range.key}, all sessions`} />
              <ActivityPanels summary={summary} now={now} />
            </section>
          </>
        ) : null}
      </div>

      <CreateSessionDialog open={showCreate} onOpenChange={setShowCreate} onCreated={() => void reload()} />
      <SessionSettingsDialog
        open={settings !== null}
        onOpenChange={(open) => !open && setSettings(null)}
        session={settings?.session ?? null}
        initialTab={settings?.tab}
        onSaved={() => void reload()}
      />
      <SessionDetailDialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)} session={detail} />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.action === "delete" ? `Delete ${confirm?.session}?` : `Log out ${confirm?.session}?`}
        description={
          confirm?.action === "delete"
            ? "This removes the session, its settings and its stored chats and messages. The WhatsApp account stays linked on the phone until you remove the device there."
            : "This unlinks the WhatsApp account and deletes the session, including its stored chats and messages. You'll need to scan a QR code to use the number again."
        }
        confirmLabel={confirm?.action === "delete" ? "Delete session" : "Log out"}
        destructive
        onConfirm={runConfirmed}
      />
    </PageLayout>
  )
}

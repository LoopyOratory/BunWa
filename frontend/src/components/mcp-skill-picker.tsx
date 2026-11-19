import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { McpToolInfo } from "@/lib/agents-api"

const CATEGORY_LABELS: Record<string, string> = {
  session: "Session",
  message: "Messaging",
  chat: "Chats",
  contact: "Contacts",
  group: "Groups",
  channel: "Channels",
  presence: "Presence",
  media: "Media",
  status: "Status",
  policy: "Policy",
  template: "Templates",
  calls: "Calls",
  external: "External tools",
  other: "Other",
}

function categoryLabel(category?: string) {
  if (!category) return "Other"
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}

export function McpSkillPicker({
  tools,
  selected,
  onToggle,
  onToggleAll,
  compact = false,
}: {
  tools: McpToolInfo[]
  selected: string[]
  onToggle: (name: string, checked: boolean) => void
  onToggleAll?: (checked: boolean) => void
  compact?: boolean
}) {
  const grouped = useMemo(() => {
    const byCategory = new Map<string, McpToolInfo[]>()
    for (const tool of tools) {
      const key =
        tool.category === "external" && tool.serverName
          ? `external:${tool.serverName}`
          : tool.category ?? "other"
      const list = byCategory.get(key) ?? []
      list.push(tool)
      byCategory.set(key, list)
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [tools])

  const allSelected = tools.length > 0 && tools.every((tool) => selected.includes(tool.name))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">MCP skills</p>
          <p className="text-xs text-muted-foreground">
            {selected.length} of {tools.length} tools selected
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onToggleAll?.(true)} disabled={allSelected}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={() => onToggleAll?.(false)} disabled={selected.length === 0}>
            Clear all
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map(([key, items]) => {
          const externalServer = key.startsWith("external:") ? key.slice("external:".length) : null
          const label = externalServer ?? categoryLabel(key)
          return (
          <Card key={key} className="border-border/70 bg-card/70">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {label}
                <Badge variant="outline">{items.length}</Badge>
              </CardTitle>
              <CardDescription>
                {externalServer ? "Tools exposed by this external MCP server" : "Tools the agent can call in this category"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 pt-0">
              {items.map((tool, index) => (
                <div key={tool.name}>
                  {index > 0 && <Separator className="my-1 opacity-50" />}
                  <div className="flex items-start justify-between gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{tool.remoteName ?? tool.name}</p>
                        <Badge variant={tool.tier === "read" ? "secondary" : "outline"}>{tool.tier}</Badge>
                        {tool.destructive && <Badge variant="destructive">destructive</Badge>}
                        {tool.sessionScoped && <Badge variant="outline">session scoped</Badge>}
                      </div>
                      {tool.remoteName && tool.remoteName !== tool.name && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">{tool.name}</p>
                      )}
                      {!compact && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tool.description}</p>}
                    </div>
                    <Switch
                      checked={selected.includes(tool.name)}
                      onCheckedChange={(checked) => onToggle(tool.name, checked)}
                      aria-label={`Toggle ${tool.remoteName ?? tool.name}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          )
        })}
      </div>
    </div>
  )
}

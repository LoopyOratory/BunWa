import { useEffect, useState } from "react"
import { FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { agentApi, type KnowledgeChunk } from "@/lib/agents-api"

/** Read-only view of exactly what the embedding model indexed. */
export function KnowledgeChunksDialog({
  agentId,
  sourceId,
  sourceName,
  open,
  onOpenChange,
}: {
  agentId: string
  sourceId: string | null
  sourceName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !sourceId) return
    let cancelled = false
    setLoading(true)
    setChunks([])
    agentApi
      .listKnowledgeChunks(agentId, sourceId)
      .then((rows) => {
        if (!cancelled) setChunks(rows)
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Could not load chunks")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, agentId, sourceId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/70 px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {sourceName || "Knowledge source"}
          </DialogTitle>
          <DialogDescription>
            {chunks.length > 0
              ? `${chunks.length} chunk${chunks.length === 1 ? "" : "s"} indexed. This is the text the retriever searches.`
              : "The chunks the embedding model made for this source."}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90dvh-96px)]">
          <div className="space-y-3 p-5">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading chunks…
              </div>
            ) : chunks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                No chunks yet. This source may still be indexing or failed.
              </p>
            ) : (
              chunks.map((chunk) => (
                <div key={chunk.id} className="rounded-xl border border-border/70 bg-card/70 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Chunk {chunk.index + 1}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {chunk.charCount.toLocaleString()} chars · ~{chunk.tokenCount.toLocaleString()} tokens
                    </span>
                    {chunk.embeddingModel && (
                      <code className="ml-auto rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {chunk.embeddingModel}
                      </code>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{chunk.text}</p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

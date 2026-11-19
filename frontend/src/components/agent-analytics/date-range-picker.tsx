import { useMemo, useState } from "react"
import { CalendarRange, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"

function toDateInput(value: string | null): string {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatRange(from: string | null, to: string | null): string {
  if (!from || !to) return "Custom dates"
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Custom dates"
  const short = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return `${short(start)} – ${short(end)}`
}

const TODAY = new Date().toISOString().slice(0, 10)

export function DateRangePicker({
  from,
  to,
  onApply,
  onClear,
}: {
  from: string | null
  to: string | null
  onApply: (from: string, to: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [error, setError] = useState<string | null>(null)

  const openPicker = () => {
    setStart(toDateInput(from))
    setEnd(toDateInput(to))
    setError(null)
    setOpen(true)
  }

  const label = useMemo(() => formatRange(from, to), [from, to])
  const active = Boolean(from && to)

  const apply = () => {
    if (!start || !end) {
      setError("Choose both a start and end date.")
      return
    }
    if (end < start) {
      setError("The end date must be on or after the start date.")
      return
    }
    const span = (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000
    if (span > 366) {
      setError("Choose a range of one year or less.")
      return
    }
    onApply(start, end)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openPicker}
        className={cn(
          "h-9 gap-2 rounded-full px-3 text-xs",
          active && "border-primary/40 bg-primary-soft/70 text-primary-strong",
        )}
        aria-label="Choose a custom date range"
      >
        <CalendarRange className="size-3.5" />
        <span className="max-w-40 truncate">{label}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="size-4 text-primary" />
              Custom date range
            </DialogTitle>
            <DialogDescription>
              Use whole days. Both the dashboard and the chat history use this range.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="analytics-start-date">Start date</Label>
              <Input
                id="analytics-start-date"
                type="date"
                value={start}
                max={end || TODAY}
                onChange={(event) => {
                  setStart(event.target.value)
                  setError(null)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analytics-end-date">End date</Label>
              <Input
                id="analytics-end-date"
                type="date"
                value={end}
                min={start || undefined}
                max={TODAY}
                onChange={(event) => {
                  setEnd(event.target.value)
                  setError(null)
                }}
              />
            </div>
          </div>

          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            End dates include the whole day, including conversations that start late in the evening.
          </p>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
              disabled={!active && !start && !end}
            >
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={apply}>
              Apply range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

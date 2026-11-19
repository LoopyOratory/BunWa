import type { AnalyticsKpi, AnalyticsUnit } from "@/lib/agents-api"

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${(value * 100).toFixed(digits)}%`
}

export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value.toFixed(1)} / 5`
}

export function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  if (value < 1000) return `${Math.round(value)} ms`
  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—"
  const value = cents / 100
  try {
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency,
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function formatValue(value: number | null | undefined, unit: AnalyticsUnit, currency = "GHS"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  switch (unit) {
    case "percent":
      return formatPercent(value, 1)
    case "rating":
      return formatRating(value)
    case "ms":
      return formatDuration(value)
    case "currency":
      return formatMoney(value, currency)
    case "count":
    default:
      return formatNumber(value)
  }
}

export function deltaLabel(kpi: AnalyticsKpi, currency = "GHS"): string {
  if (kpi.delta === null) return "No previous data"
  const positive = kpi.delta >= 0
  const sign = positive ? "+" : ""
  if (kpi.unit === "percent") return `${sign}${(kpi.delta * 100).toFixed(1)} pp`
  if (kpi.unit === "rating") return `${sign}${kpi.delta.toFixed(1)}`
  if (kpi.unit === "ms") return `${sign}${formatDuration(kpi.delta)}`
  if (kpi.unit === "currency") return `${sign}${formatMoney(kpi.delta, currency)}`
  const pct = kpi.deltaPct === null ? "" : ` (${sign}${kpi.deltaPct.toFixed(0)}%)`
  return `${sign}${formatNumber(kpi.delta)}${pct}`
}

export function deltaTone(kpi: AnalyticsKpi, invert = false): "up" | "down" | "flat" {
  if (kpi.delta === null || kpi.delta === 0) return "flat"
  const good = invert ? kpi.delta < 0 : kpi.delta > 0
  return good ? "up" : "down"
}

export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "converted":
      return "Converted"
    case "resolved":
      return "Resolved"
    case "handoff":
      return "Handoff"
    case "abandoned":
      return "Abandoned"
    case "open":
      return "Open"
    default:
      return "Unclassified"
  }
}

export function outcomeTone(outcome: string): "success" | "warning" | "error" | "neutral" | "info" {
  switch (outcome) {
    case "converted":
    case "resolved":
      return "success"
    case "handoff":
      return "warning"
    case "abandoned":
      return "error"
    case "open":
      return "info"
    default:
      return "neutral"
  }
}

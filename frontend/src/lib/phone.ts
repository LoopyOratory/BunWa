/** Phone helpers: the user types only the main number; a country selector
 *  supplies the dial code and WhatsApp id suffixes are added automatically. */
import { COUNTRIES, type Country } from "@/lib/phone-countries"

export { COUNTRIES }
export type { Country }

/** Default country for new phone inputs (Ghana-first product). */
export const DEFAULT_COUNTRY = "GH"

/** The country for an ISO code, falling back to the first entry. */
export function countryByIso(iso: string): Country {
  return COUNTRIES.find((c) => c.code === iso) ?? COUNTRIES[0]
}

/** International digits-only number from whatever the user typed:
 *  - a full id ("233...@c.us"): its digits
 *  - "+..." or "00...": already international, just cleaned
 *  - anything else: the selected country's dial code + the number with its
 *    leading zeros removed. */
export function toIntlDigits(iso: string, raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  if (t.includes("@")) return t.slice(0, t.indexOf("@")).replace(/\D/g, "")
  const digits = t.replace(/\D/g, "")
  if (!digits) return ""
  if (t.startsWith("+")) return digits
  if (t.startsWith("00")) return digits.replace(/^00/, "")
  return `${countryByIso(iso).dial}${digits.replace(/^0+/, "")}`
}

/** Full WhatsApp chat id ("<intl>@c.us"). Inputs that already carry an id
 *  ("...@c.us", "...@g.us") pass through untouched. */
export function toChatId(iso: string, raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  if (t.includes("@")) return t
  const digits = toIntlDigits(iso, t)
  return digits ? `${digits}@c.us` : ""
}

/** Read a stored id back into (country, national number) for editing.
 *  Longest matching dial prefix wins; null when nothing matches. */
export function splitJid(jid: string): { iso: string; national: string } | null {
  const t = jid.trim()
  if (!t) return null
  const digits = (t.includes("@") ? t.slice(0, t.indexOf("@")) : t).replace(/\D/g, "")
  if (!digits) return null
  let best: { iso: string; national: string; len: number } | null = null
  for (const c of COUNTRIES) {
    if (!digits.startsWith(c.dial)) continue
    if (!best || c.dial.length > best.len) {
      best = { iso: c.code, national: digits.slice(c.dial.length), len: c.dial.length }
    }
  }
  return best ? { iso: best.iso, national: best.national } : null
}

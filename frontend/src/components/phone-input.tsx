import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COUNTRIES, countryByIso, toChatId, toIntlDigits } from "@/lib/phone"
import { cn } from "@/lib/utils"

interface PhoneInputProps {
  id?: string
  country: string
  onCountryChange: (iso: string) => void
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** What the helper line under the field shows: the resolved chat id (default),
   *  digits only, or nothing. */
  preview?: "chatId" | "digits" | false
  /** Fired on Enter in the number field. */
  onEnter?: () => void
  className?: string
}

/** Country selector + national-number field. The user types only the main
 *  number; the selector supplies the country code and the WhatsApp suffix
 *  ("@c.us") is added automatically. Pasting a full id or "+..." still works. */
export function PhoneInput({
  id,
  country,
  onCountryChange,
  value,
  onChange,
  placeholder = "201234567",
  disabled,
  preview = "chatId",
  onEnter,
  className,
}: PhoneInputProps) {
  const selected = countryByIso(country)
  const resolved = preview === "digits" ? toIntlDigits(country, value) : toChatId(country, value)
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <Select value={selected.code} onValueChange={onCountryChange} disabled={disabled}>
          <SelectTrigger className="w-[6.75rem] shrink-0" aria-label="Country calling code">
            <SelectValue>{`${selected.flag} +${selected.dial}`}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.name} (+{c.dial})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onEnter ? (e) => e.key === "Enter" && onEnter() : undefined}
          placeholder={placeholder}
          inputMode="tel"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className="flex-1"
        />
      </div>
      {preview !== false && value.trim() !== "" && resolved && (
        <p className="text-xs text-muted-foreground">
          Resolves to <span className="font-medium text-foreground">{resolved}</span>
        </p>
      )}
    </div>
  )
}

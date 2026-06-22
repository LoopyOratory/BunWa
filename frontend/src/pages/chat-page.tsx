import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, type Session, type ChatOverview, type Message, type Contact } from "@/lib/api"
import { useWebSocket } from "@/lib/use-websocket"
import { toast } from "sonner"
import {
  Send,
  Search,
  CheckCheck,
  Check,
  Clock,
  Play,
  RefreshCw,
  Smile,
  Reply,
  Trash2,
  Pin,
  Star,
  Edit,
  ArrowDown,
  MoreVertical,
  Paperclip,
  Image as ImageIcon,
  Mic,
  MapPin,
  BarChart3,
  MessageSquarePlus,
  Forward,
  Archive,
  X,
  ChevronDown,
  CircleDot,
  Camera,
  Plus,
  Minus,
  Circle,
} from "lucide-react"
import { useTheme } from "next-themes"

/* ------------------------------------------------------------------ */
/*  AVATAR PALETTE                                                     */
/* ------------------------------------------------------------------ */
const AV_COLORS = [
  { bg: "#d1fae5", fg: "#065f46", darkBg: "#1a3020", darkFg: "#4ade80" },
  { bg: "#dbeafe", fg: "#1e40af", darkBg: "#1a2030", darkFg: "#60a5fa" },
  { bg: "#ede9fe", fg: "#5b21b6", darkBg: "#22183a", darkFg: "#a78bfa" },
  { bg: "#fef3c7", fg: "#92400e", darkBg: "#2a1e0f", darkFg: "#fbbf24" },
  { bg: "#fee2e2", fg: "#991b1b", darkBg: "#2a1515", darkFg: "#f87171" },
  { bg: "#ccfbf1", fg: "#115e59", darkBg: "#0f2520", darkFg: "#2dd4bf" },
  { bg: "#fce7f3", fg: "#9d174d", darkBg: "#2a1525", darkFg: "#f472b6" },
]
function avColor(id: string, isDark: boolean) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  const c = AV_COLORS[Math.abs(h) % AV_COLORS.length]
  return isDark ? { bg: c.darkBg, fg: c.darkFg } : { bg: c.bg, fg: c.fg }
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
function chatName(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  // Backend resolves LID to phone number, so chat.name should already be set
  if (chat.name) return chat.name
  // Fallback: check contacts for saved name
  if (contactsMap) {
    for (const [, contact] of contactsMap) {
      if (contact.id === chat.id) return contact.name || contact.notify || chat.id.split("@")[0]
    }
  }
  return chat.id.split("@")[0] || chat.id
}
function chatInitials(chat: ChatOverview, contactsMap?: Map<string, Contact>): string {
  const name = chatName(chat, contactsMap)
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}
function formatBubbleTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
function formatDateSeparator(ts: number): string {
  const d = new Date(ts * 1000)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.floor((today.getTime() - msgDate.getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" })
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
}
function shouldShowDateSeparator(cur: Message, prev: Message | null): boolean {
  if (!prev) return true
  return new Date(cur.timestamp * 1000).toDateString() !== new Date(prev.timestamp * 1000).toDateString()
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

const EMOJI_CATEGORIES: { label: string; icon: string; emojis: string[] }[] = [
  { label: "Smileys", icon: "😊", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"] },
  { label: "Gestures", icon: "👋", emojis: ["👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪"] },
  { label: "People", icon: "👤", emojis: ["👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷","👮","🕵️","💂","🥷","👷","🫅","🤴","👸","👳","👲","🧕","🤵","👰","🤰","🫃","🤱","👼","🎅","🤶","🦸","🦹","🧙","🧚","🧛","🧜","🧝","💆","💇","🚶","🧍","🧎","🏃","💃","🕺"] },
  { label: "Nature", icon: "🌿", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🦭","🐊"] },
  { label: "Food", icon: "🍕", emojis: ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🌮","🌯","🥗","🥘","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🥤","☕","🍵","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹"] },
  { label: "Activities", icon: "⚽", emojis: ["🎃","🎄","🎆","🎇","🧨","✨","🎈","🎉","🎊","🎋","🎍","🎎","🎏","🎐","🧧","🎀","🎁","🏆","🏅","🥇","🥈","🥉","⚽","⚾","🏀","🏐","🏈","🏉","🎾","🎳","🏏","🏑","🏒","🏓","🏸","🥊","🥋","⛳","⛸️","🎣","🎿","🎯","🎱","🎮","🕹️","🎰","🎲","🧩","🧸","🎭","🎨"] },
  { label: "Travel", icon: "🚗", emojis: ["🚗","🚕","🚙","🚌","🏎️","🚓","🚑","🚒","🚐","🚚","🚛","🚜","🏍️","🛵","🚲","🛴","⛽","🚨","🚥","🚦","🛑","⚓","⛵","🚤","🛳️","⛴️","🛥️","🚢","✈️","🛩️","🛫","🛬","🪂","💺","🚁","🚟","🚠","🛰️","🚀","🛸","🌍","🌎","🌏","🗺️","🧭","🏔️","⛰️","🌋","🗻","🏕️","🏖️","🏜️","🏝️","🏞️","🏟️","🏛️","🏗️","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🕍","⛩️","🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","🌌"] },
  { label: "Objects", icon: "💡", emojis: ["⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","📷","📸","📹","🎥","📞","☎️","📺","📻","🧭","⏰","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯️","🧯","💸","💵","💴","💶","💷","💰","💳","💎","⚖️","🧰","🔧","🔩","⚙️","🔬","🔭","💉","💊","🩹","🚪","🛏️","🛋️","🚽","🚿","🛁","🧹","🧺","🧻","🧼","🛒","🚬","⚰️","🗿"] },
  { label: "Symbols", icon: "❤️", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","☯️","☦️","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","☢️","☣️","📴","✴️","🆚","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞","📵","🚭","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❇️","✳️","❎","🌐","💠","🌀","💤","🏧","🚾","♿","🅿️","🚹","🚺","🚻","🚼","🎦","📶","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","▶️","⏸️","⏹️","⏭️","⏮️","⏩","⏪","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","🔀","🔁","🔂","🔄","🎵","🎶","➕","➖","➗","✖️","♾️","💲","💱","™️","©️","®️","〰️","➰","➿","🔚","🔙","🔛","🔝","🔜","✔️","☑️","🔘","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔺","🔻","🔸","🔹","🔶","🔷","🔳","🔲","▪️","▫️","◾","◽","◼️","◻️","🟥","🟧","🟨","🟩","🟦","🟪","⬛","⬜","🟫","🔇","🔉","🔊","🔔","🔕","📣","📢"] },
]

/* ------------------------------------------------------------------ */
/*  THEME-AWARE CLASS HELPERS                                          */
/* ------------------------------------------------------------------ */
const C = {
  bg: "bg-white dark:bg-[#1a1a1e]",
  bgAlt: "bg-zinc-50 dark:bg-[#111113]",
  bgMain: "bg-zinc-100 dark:bg-[#141418]",
  bgHover: "hover:bg-zinc-100 dark:hover:bg-[#1e1e22]",
  bgActive: "bg-emerald-50 dark:bg-[#0f1f17]",
  bgBubbleSent: "bg-emerald-600 dark:bg-[#1a3020]",
  bgBubbleRecv: "bg-zinc-100 dark:bg-[#1e1e22]",
  bgInput: "bg-zinc-100 dark:bg-[#1e1e22]",
  bgHeader: "bg-white dark:bg-[#16161a]",
  bgPopover: "bg-white dark:bg-[#16161a]",
  bgAccent: "bg-emerald-50 dark:bg-[#1a2f22]",
  border: "border-zinc-200 dark:border-[#2a2a2e]",
  borderLight: "border-zinc-100 dark:border-[#1e1e22]",
  text: "text-zinc-900 dark:text-zinc-100",
  textSecondary: "text-zinc-500 dark:text-zinc-400",
  textMuted: "text-zinc-400 dark:text-zinc-600",
  textAccent: "text-emerald-600 dark:text-[#4ade80]",
  sentText: "text-white dark:text-zinc-200",
  recvText: "text-zinc-800 dark:text-zinc-300",
  accent: "text-emerald-600 dark:text-[#4ade80]",
  accentBg: "bg-emerald-600 dark:bg-[#1a3020]",
  accentHover: "hover:bg-emerald-700 dark:hover:bg-[#1f3d28]",
  iconBtn: "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#1e1e22]",
  activeBar: "bg-emerald-500 dark:bg-[#4ade80]",
  datePill: "bg-zinc-200 dark:bg-[#2a2a2e] text-zinc-500 dark:text-zinc-500",
  badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  statusDot: "bg-emerald-500 dark:bg-[#4ade80]",
}

/* ------------------------------------------------------------------ */
/*  ACK ICONS                                                          */
/* ------------------------------------------------------------------ */
function AckIcon({ ack }: { ack: number }) {
  if (ack === 3) return <CheckCheck className="size-3.5 text-blue-500" />
  if (ack === 2) return <CheckCheck className="size-3.5 text-zinc-400" />
  if (ack === 1) return <Check className="size-3.5 text-zinc-400" />
  return <Clock className="size-3 text-zinc-300" />
}

/* ------------------------------------------------------------------ */
/*  EMOJI PICKER                                                       */
/* ------------------------------------------------------------------ */
function EmojiPickerPopup({
  onSelect,
  onClose,
  position,
}: {
  onSelect: (emoji: string) => void
  onClose: () => void
  position: { x: number; y: number }
}) {
  const [activeCategory, setActiveCategory] = useState(0)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [onClose])

  const filtered = search
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    : EMOJI_CATEGORIES[activeCategory].emojis

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`fixed z-50 ${C.bgPopover} border ${C.border} rounded-2xl shadow-2xl w-[340px] flex flex-col overflow-hidden`}
      style={{
        bottom: window.innerHeight - position.y + 8,
        left: Math.min(position.x, window.innerWidth - 360),
      }}
    >
      <div className={`p-2 border-b ${C.border}`}>
        <div className="relative">
          <Search className={`absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 ${C.textMuted}`} />
          <Input
            placeholder="Search emoji"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`h-8 pl-8 ${C.bgInput} border-0 ${C.text} text-xs placeholder:${C.textMuted} rounded-lg`}
            autoFocus
          />
        </div>
      </div>
      <div className={`flex gap-0.5 px-2 py-1.5 border-b ${C.border} overflow-x-auto`}>
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            onClick={() => { setActiveCategory(i); setSearch("") }}
            className={`shrink-0 size-8 rounded-lg flex items-center justify-center text-base transition-colors ${
              activeCategory === i && !search ? C.bgAccent : C.bgHover
            }`}
            title={cat.label}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div className={`flex gap-1 px-3 py-2 border-b ${C.border}`}>
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} onClick={() => { onSelect(emoji); onClose() }} className={`size-9 rounded-lg flex items-center justify-center text-xl ${C.bgHover} transition-colors`}>
            {emoji}
          </button>
        ))}
      </div>
      <div className="px-3 py-1.5">
        <span className={`text-[10px] font-semibold ${C.textMuted} uppercase tracking-wider`}>
          {search ? "Search Results" : EMOJI_CATEGORIES[activeCategory].label}
        </span>
      </div>
      <div className="h-[200px] overflow-auto px-1 pb-2">
        <div className="grid grid-cols-8 gap-0.5">
          {filtered.map((emoji, i) => (
            <button key={`${emoji}-${i}`} onClick={() => { onSelect(emoji); onClose() }} className={`size-9 rounded-lg flex items-center justify-center text-xl ${C.bgHover} transition-colors`}>
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  NEW CHAT DIALOG                                                    */
/* ------------------------------------------------------------------ */
function NewChatDialog({ open, onOpenChange, session, onOpenChat }: { open: boolean; onOpenChange: (v: boolean) => void; session: string; onOpenChat: (chatId: string) => void }) {
  const [phone, setPhone] = useState("")
  const [checking, setChecking] = useState(false)
  const handleCheck = async () => {
    if (!phone.trim()) return
    setChecking(true)
    try {
      const res = await api.checkNumberStatus(session, phone.replace(/\D/g, ""))
      if (res.numberExists && res.chatId) { onOpenChat(res.chatId); onOpenChange(false); setPhone("") }
      else toast.error("Number not found on WhatsApp")
    } catch { toast.error("Failed to check number") }
    finally { setChecking(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${C.bgAlt} ${C.border} ${C.text} sm:max-w-md`}>
        <DialogHeader><DialogTitle className={C.text}>Start New Chat</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <Label className={`${C.textSecondary} text-xs`}>Phone number (with country code)</Label>
          <Input placeholder="+1234567890" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCheck()} className={`${C.bgInput} ${C.border} ${C.text} placeholder:${C.textMuted}`} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className={C.textSecondary}>Cancel</Button>
          <Button onClick={handleCheck} disabled={checking || !phone.trim()} className={`${C.accentBg} text-white ${C.accentHover}`}>
            {checking && <RefreshCw className="size-4 animate-spin mr-2" />}Start Chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  SEND MEDIA DIALOG                                                  */
/* ------------------------------------------------------------------ */
function SendMediaDialog({ open, onOpenChange, type, session, chatId, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void
  type: "image" | "file" | "voice" | "video" | "location" | "poll"
  session: string; chatId: string; onSent: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [title, setTitle] = useState("")
  const [pollName, setPollName] = useState("")
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""])
  const [pollType, setPollType] = useState<"single" | "multiple">("single")
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordTime, setRecordTime] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const reset = () => {
    setFile(null); setCaption(""); setLat(""); setLng(""); setTitle("")
    setPollName(""); setPollOptions(["", ""]); setPollType("single")
    setRecording(false); setRecordedBlob(null); setRecordTime(0)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(f)
    })

  const handleSend = async () => {
    setSending(true)
    try {
      if (type === "location") {
        await api.sendLocation(session, chatId, parseFloat(lat), parseFloat(lng), title)
      } else if (type === "poll") {
        const opts = pollOptions.map((o) => o.trim()).filter(Boolean)
        await api.sendPoll(session, chatId, { name: pollName, values: opts, multipleAnswers: pollType === "multiple" })
      } else if (type === "voice" && recordedBlob) {
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(recordedBlob)
        })
        await api.sendVoice(session, chatId, { mimetype: "audio/ogg", filename: "voice.ogg", data: base64 })
      } else if (file) {
        const base64 = await fileToBase64(file)
        const fileData = { mimetype: file.type, filename: file.name, data: base64 }
        if (type === "image") await api.sendImage(session, chatId, fileData, caption)
        else if (type === "video") await api.sendVideo(session, chatId, fileData, caption)
        else if (type === "file") await api.sendFile(session, chatId, fileData, caption)
      }
      toast.success("Sent!")
      onSent()
      onOpenChange(false)
      reset()
    } catch { toast.error("Failed to send") }
    finally { setSending(false) }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: "audio/ogg" })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/ogg" })
        setRecordedBlob(blob)
        stream.getTracks().forEach((t) => t.stop())
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordTime(0)
      recordTimerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000)
    } catch { toast.error("Microphone access denied") }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    if (recordTimerRef.current) clearInterval(recordTimerRef.current)
  }

  const formatRecordTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`

  const titles: Record<string, string> = { image: "Send Image", file: "Send File", voice: "Send Voice", video: "Send Video", location: "Send Location", poll: "Create Poll" }
  const acceptTypes: Record<string, string> = { image: "image/*", video: "video/*", file: "*" }
  const icons: Record<string, typeof ImageIcon> = { image: ImageIcon, file: Paperclip, voice: Mic, video: Camera }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className={`${C.bgAlt} ${C.border} ${C.text} sm:max-w-md`}>
        <DialogHeader><DialogTitle className={C.text}>{titles[type]}</DialogTitle></DialogHeader>

        {/* FILE UPLOAD (image, video, file) */}
        {(type === "image" || type === "file" || type === "video") && (
          <div className="space-y-3 py-2">
            <input ref={fileRef} type="file" accept={acceptTypes[type]} className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }} />
            {!file ? (
              <button onClick={() => fileRef.current?.click()}
                className={`w-full border-2 border-dashed ${C.border} rounded-xl py-10 flex flex-col items-center gap-3 ${C.bgHover} cursor-pointer transition-colors`}>
                {(() => { const Icon = icons[type]; return <Icon className={`size-10 ${C.textMuted}`} />; })()}
                <div className="text-center">
                  <p className={`text-sm font-medium ${C.text}`}>Click to select {type}</p>
                  <p className={`text-xs ${C.textMuted} mt-1`}>or drag and drop</p>
                </div>
              </button>
            ) : (
              <div className={`flex items-center gap-3 p-3 rounded-xl ${C.bgInput} border ${C.border}`}>
                {(() => { const Icon = icons[type]; return <Icon className={`size-5 shrink-0 ${C.textAccent}`} />; })()}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm truncate ${C.text}`}>{file.name}</p>
                  <p className={`text-xs ${C.textMuted}`}>{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setFile(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            )}
            {(type === "image" || type === "video" || type === "file") && (
              <>
                <Label className={`${C.textSecondary} text-xs`}>Caption (optional)</Label>
                <Input placeholder="Add a caption..." value={caption} onChange={(e) => setCaption(e.target.value)}
                  className={`${C.bgInput} ${C.border} ${C.text} placeholder:${C.textMuted}`} />
              </>
            )}
          </div>
        )}

        {/* VOICE RECORDING */}
        {type === "voice" && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-4">
              {!recording && !recordedBlob ? (
                <button onClick={startRecording}
                  className={`size-20 rounded-full flex items-center justify-center transition-all ${C.accentBg} text-white hover:scale-105`}>
                  <Mic className="size-8" />
                </button>
              ) : recording ? (
                <div className="flex flex-col items-center gap-3">
                  <button onClick={stopRecording}
                    className="size-20 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 animate-pulse">
                    <CircleDot className="size-8" />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                    <span className={`text-sm font-mono ${C.text}`}>{formatRecordTime(recordTime)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className={`size-20 rounded-full flex items-center justify-center ${C.bgInput} ${C.border}`}>
                    <Mic className={`size-8 ${C.textAccent}`} />
                  </div>
                  <p className={`text-sm ${C.text}`}>Recorded {formatRecordTime(recordTime)}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setRecordedBlob(null); setRecordTime(0) }}
                      className={`${C.border} ${C.text}`}>
                      Re-record
                    </Button>
                  </div>
                </div>
              )}
              <p className={`text-xs ${C.textMuted}`}>
                {!recording && !recordedBlob ? "Tap to start recording" : recording ? "Tap to stop" : "Ready to send"}
              </p>
            </div>
          </div>
        )}

        {type === "location" && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className={`${C.textSecondary} text-xs`}>Latitude</Label><Input placeholder="5.6037" value={lat} onChange={(e) => setLat(e.target.value)} className={`${C.bgInput} ${C.border} ${C.text}`} /></div>
              <div><Label className={`${C.textSecondary} text-xs`}>Longitude</Label><Input placeholder="-0.1870" value={lng} onChange={(e) => setLng(e.target.value)} className={`${C.bgInput} ${C.border} ${C.text}`} /></div>
            </div>
            <Label className={`${C.textSecondary} text-xs`}>Title (optional)</Label>
            <Input placeholder="Location name" value={title} onChange={(e) => setTitle(e.target.value)} className={`${C.bgInput} ${C.border} ${C.text}`} />
          </div>
        )}

        {type === "poll" && (
          <div className="space-y-3 py-2">
            <Label className={`${C.textSecondary} text-xs`}>Poll Question</Label>
            <Input placeholder="What's your question?" value={pollName} onChange={(e) => setPollName(e.target.value)} className={`${C.bgInput} ${C.border} ${C.text}`} />
            <Label className={`${C.textSecondary} text-xs`}>Poll Type</Label>
            <div className="flex gap-2">
              <button onClick={() => setPollType("single")} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${pollType === "single" ? `${C.accentBg} text-white` : `${C.bgInput} ${C.textSecondary}`}`}>
                Single Choice
              </button>
              <button onClick={() => setPollType("multiple")} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-colors ${pollType === "multiple" ? `${C.accentBg} text-white` : `${C.bgInput} ${C.textSecondary}`}`}>
                Multiple Choice
              </button>
            </div>
            <Label className={`${C.textSecondary} text-xs`}>Options</Label>
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Circle className={`size-3 ${C.textMuted} shrink-0`} />
                <Input placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => { const n = [...pollOptions]; n[i] = e.target.value; setPollOptions(n) }} className={`${C.bgInput} ${C.border} ${C.text} flex-1`} />
                {pollOptions.length > 2 && (
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                    <Minus className="size-3" />
                  </Button>
                )}
              </div>
            ))}
            {pollOptions.length < 10 && (
              <Button variant="ghost" size="sm" className={`gap-1 ${C.textAccent}`} onClick={() => setPollOptions([...pollOptions, ""])}>
                <Plus className="size-3" /> Add Option
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className={C.textSecondary}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || (type === "poll" ? !pollName.trim() : type === "location" ? !lat || !lng : type === "voice" ? !recordedBlob : !file)} className={`${C.accentBg} text-white ${C.accentHover}`}>
            {sending && <RefreshCw className="size-4 animate-spin mr-2" />}Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  STATUS DIALOG                                                      */
/* ------------------------------------------------------------------ */
function StatusDialog({ open, onOpenChange, session, onSent }: { open: boolean; onOpenChange: (v: boolean) => void; session: string; onSent: () => void }) {
  const [statusType, setStatusType] = useState<"text" | "image" | "video">("text")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSend = async () => {
    setSending(true)
    try {
      if (statusType === "text") {
        await api.postTextStatus(session, text)
      } else if (file) {
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string)
          reader.readAsDataURL(file)
        })
        const fileData = { mimetype: file.type, filename: file.name, data: base64 }
        if (statusType === "image") await api.postImageStatus(session, fileData, text)
        else await api.postVideoStatus(session, fileData, text)
      }
      toast.success("Status posted!")
      onSent()
      onOpenChange(false)
      setText(""); setFile(null)
    } catch { toast.error("Failed to post status") }
    finally { setSending(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${C.bgAlt} ${C.border} ${C.text} sm:max-w-md`}>
        <DialogHeader><DialogTitle className={C.text}>Post Status</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            {(["text", "image", "video"] as const).map((t) => (
              <button key={t} onClick={() => { setStatusType(t); setFile(null) }} className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium capitalize transition-colors ${statusType === t ? `${C.accentBg} text-white` : `${C.bgInput} ${C.textSecondary}`}`}>
                {t}
              </button>
            ))}
          </div>
          {statusType === "text" ? (
            <Textarea placeholder="What's on your mind?" value={text} onChange={(e) => setText(e.target.value)} className={`${C.bgInput} ${C.border} ${C.text} min-h-[100px]`} />
          ) : (
            <>
              <input ref={fileRef} type="file" accept={statusType === "image" ? "image/*" : "video/*"} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {!file ? (
                <button onClick={() => fileRef.current?.click()} className={`w-full border-2 border-dashed ${C.border} rounded-xl py-8 flex flex-col items-center gap-2 ${C.bgHover} cursor-pointer`}>
                  <Camera className={`size-8 ${C.textMuted}`} />
                  <span className={`text-sm ${C.textSecondary}`}>Select {statusType}</span>
                </button>
              ) : (
                <div className={`flex items-center gap-3 p-3 rounded-xl ${C.bgInput}`}>
                  <ImageIcon className={`size-5 ${C.textAccent}`} />
                  <span className={`text-sm truncate flex-1 ${C.text}`}>{file.name}</span>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setFile(null)}><X className="size-4" /></Button>
                </div>
              )}
              <Input placeholder="Caption (optional)" value={text} onChange={(e) => setText(e.target.value)} className={`${C.bgInput} ${C.border} ${C.text}`} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className={C.textSecondary}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || (statusType === "text" ? !text.trim() : !file)} className={`${C.accentBg} text-white ${C.accentHover}`}>
            {sending && <RefreshCw className="size-4 animate-spin mr-2" />}Post Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ================================================================== */
/*  MAIN CHAT PAGE                                                     */
/* ================================================================== */
interface ChatPageProps { initialSession?: string | null }

export function ChatPage({ initialSession }: ChatPageProps) {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState("")
  const [chats, setChats] = useState<ChatOverview[]>([])
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map())
  const [selectedChat, setSelectedChat] = useState<ChatOverview | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageText, setMessageText] = useState("")
  const [chatSearch, setChatSearch] = useState("")
  const [loadingChats, setLoadingChats] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [startingSession, setStartingSession] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState<{ msgId: string; x: number; y: number } | null>(null)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [mediaDialog, setMediaDialog] = useState<{ open: boolean; type: "image" | "file" | "voice" | "video" | "location" | "poll" }>({ open: false, type: "image" })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /* ---- data ---- */
  const loadSessions = useCallback(async () => { try { setSessions(await api.getSessions()) } catch {} }, [])
  useEffect(() => { loadSessions(); const iv = setInterval(loadSessions, 30000); return () => clearInterval(iv) }, [loadSessions])
  useEffect(() => { if (sessions.length > 0 && !selectedSession) setSelectedSession(initialSession || sessions[0].name) }, [sessions, selectedSession, initialSession])
  useEffect(() => { setSelectedChat(null); setMessages([]) }, [selectedSession])

  const currentSession = sessions.find((s) => s.name === selectedSession)
  const isWorking = currentSession?.status === "WORKING"

  // Load contacts for LID resolution
  const loadContacts = useCallback(async () => {
    if (!selectedSession || !isWorking) { setContacts(new Map()); return }
    try {
      const contactList = await api.getContacts(selectedSession, 500, 0)
      const map = new Map<string, Contact>()
      for (const c of contactList) map.set(c.id, c)
      setContacts(map)
    } catch { /* ignore */ }
  }, [selectedSession, isWorking])
  useEffect(() => { loadContacts() }, [loadContacts])

  const loadChats = useCallback(async () => {
    if (!selectedSession || !isWorking) { setChats([]); return }
    setLoadingChats(true)
    try { setChats(await api.getChatsOverview(selectedSession)) }
    catch { toast.error("Failed to load chats") }
    finally { setLoadingChats(false) }
  }, [selectedSession, isWorking])
  useEffect(() => { loadChats() }, [loadChats])

  const loadMessages = useCallback(async (chatId: string) => {
    if (!selectedSession) return
    setLoadingMessages(true)
    try { setMessages(await api.getMessages(selectedSession, chatId)); api.sendSeen(selectedSession, chatId).catch(() => {}) }
    catch { toast.error("Failed to load messages") }
    finally { setLoadingMessages(false) }
  }, [selectedSession])
  useEffect(() => { if (selectedChat) loadMessages(selectedChat.id) }, [selectedChat, loadMessages])

  /* ---- websocket (stable refs to avoid reconnects) ---- */
  const selectedSessionRef = useRef(selectedSession)
  selectedSessionRef.current = selectedSession
  const selectedChatRef = useRef(selectedChat)
  selectedChatRef.current = selectedChat
  const loadMessagesRef = useRef(loadMessages)
  loadMessagesRef.current = loadMessages
  const loadChatsRef = useRef(loadChats)
  loadChatsRef.current = loadChats
  const chatsLoadPendingRef = useRef(false)

  const handleWsMessage = useCallback((data: any) => {
    if (!data || typeof data !== "object") return
    if (data.session && selectedSessionRef.current && data.session !== selectedSessionRef.current) return
    const event = data.event as string | undefined
    if (!event) return
    if (["message", "message.any", "message.ack", "message.reaction"].includes(event)) {
      if (selectedChatRef.current) loadMessagesRef.current(selectedChatRef.current.id)
      // Debounce chat list reload — don't reload on every message
      if (!chatsLoadPendingRef.current) {
        chatsLoadPendingRef.current = true
        setTimeout(() => {
          chatsLoadPendingRef.current = false
          loadChatsRef.current()
        }, 2000)
      }
    }
  }, [])
  useWebSocket({ session: selectedSession || "*", events: "message,message.any,message.ack,message.reaction", onMessage: handleWsMessage })

  /* ---- scroll ---- */
  useEffect(() => { if (!showScrollButton) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, showScrollButton])
  const handleScroll = useCallback(() => { const c = messagesContainerRef.current; if (!c) return; setShowScrollButton(c.scrollHeight - c.scrollTop - c.clientHeight > 100) }, [])

  /* ---- actions ---- */
  const handleStartSession = async () => {
    if (!selectedSession) return
    setStartingSession(true)
    try { await api.startSession(selectedSession); toast.success("Session starting…"); await loadSessions() }
    catch { toast.error("Failed to start session") }
    finally { setStartingSession(false) }
  }
  const handleTyping = useCallback(() => {
    if (!selectedSession || !selectedChat || !isWorking) return
    api.startTyping(selectedSession, selectedChat.id).catch(() => {})
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => api.stopTyping(selectedSession, selectedChat.id).catch(() => {}), 3000)
  }, [selectedSession, selectedChat, isWorking])
  const handleSend = async () => {
    if (!messageText.trim() || !selectedSession || !selectedChat) return
    const text = messageText.trim()
    if (editingMessage) {
      try { await api.editMessage(selectedSession, selectedChat.id, editingMessage.id, text); setEditingMessage(null); setMessageText(""); await loadMessages(selectedChat.id) }
      catch { toast.error("Failed to edit message") }
      return
    }
    setMessageText(""); setReplyingTo(null)
    try { await api.sendText(selectedSession, selectedChat.id, text, replyingTo?.id); await loadMessages(selectedChat.id); await loadChats() }
    catch { toast.error("Failed to send message") }
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
    if (e.key === "Escape") { setReplyingTo(null); setEditingMessage(null); setMessageText("") }
  }
  const handleReaction = async (msgId: string, emoji: string) => {
    if (!selectedSession || !selectedChat) return
    try { await api.setReaction(selectedSession, selectedChat.id, msgId, emoji); setShowReactionPicker(null); await loadMessages(selectedChat.id) }
    catch { toast.error("Failed to set reaction") }
  }
  const handleDelete = async (msgId: string) => {
    if (!selectedSession || !selectedChat) return
    try { await api.deleteMessage(selectedSession, selectedChat.id, msgId); await loadMessages(selectedChat.id) }
    catch { toast.error("Failed to delete message") }
  }
  const handlePin = async (msgId: string) => {
    if (!selectedSession || !selectedChat) return
    try { await api.pinMessage(selectedSession, selectedChat.id, msgId); toast.success("Pinned") }
    catch { toast.error("Failed to pin") }
  }
  const handleStar = async (msgId: string) => {
    if (!selectedSession || !selectedChat) return
    try { await api.setStar(selectedSession, selectedChat.id, msgId, true); await loadMessages(selectedChat.id) }
    catch { toast.error("Failed to star") }
  }
  const handleForward = async (_msgId: string) => { toast.info("Select a chat to forward to") }
  const handleNewChatOpen = (chatId: string) => {
    const fakeChat: ChatOverview = { id: chatId, name: chatId.split("@")[0] }
    setSelectedChat(fakeChat)
    setChats((prev) => prev.some((c) => c.id === chatId) ? prev : [fakeChat, ...prev])
  }

  const filteredChats = chats.filter((c) => !chatSearch || chatName(c).toLowerCase().includes(chatSearch.toLowerCase()))

  /* ---- NO SESSION ---- */
  if (!selectedSession) {
    return (
      <div className={`flex h-full items-center justify-center ${C.bgMain}`}>
        <div className="text-center">
          <CircleDot className={`mx-auto mb-3 size-10 ${C.textMuted}`} />
          <p className={`text-sm ${C.textSecondary}`}>No active sessions</p>
          <p className={`text-xs ${C.textMuted} mt-1`}>Create and start a session first</p>
        </div>
      </div>
    )
  }

  /* ---- CHAT LIST ---- */
  const ChatListPanel = ({ className = "" }: { className?: string }) => (
    <div className={`flex h-full flex-col ${C.bgAlt} border-r ${C.border} ${className}`}>
      <div className="p-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className={`text-lg font-bold ${C.text} tracking-tight`}>Messages</h2>
          <div className="flex gap-1">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`size-8 ${C.iconBtn}`} onClick={() => setStatusOpen(true)}>
                <CircleDot className="size-4" />
              </Button>
            </TooltipTrigger><TooltipContent>Post Status</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`size-8 ${C.iconBtn}`} onClick={() => setNewChatOpen(true)}>
                <MessageSquarePlus className="size-4" />
              </Button>
            </TooltipTrigger><TooltipContent>New Chat</TooltipContent></Tooltip>
            {!isWorking && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={`size-8 ${startingSession ? "text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10" : C.iconBtn}`} onClick={handleStartSession} disabled={startingSession}>
                  {startingSession ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
                </Button>
              </TooltipTrigger><TooltipContent>Start Session</TooltipContent></Tooltip>
            )}
          </div>
        </div>
        <Select value={selectedSession} onValueChange={setSelectedSession}>
          <SelectTrigger className={`${C.bgInput} ${C.border} ${C.text} h-8 text-xs`}>
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full shrink-0 ${isWorking ? C.statusDot : "bg-zinc-400 dark:bg-zinc-600"}`} />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent className={`${C.bgAlt} ${C.border}`}>
            {sessions.map((s) => (
              <SelectItem key={s.name} value={s.name} className={`${C.text} focus:${C.bgAccent} focus:${C.textAccent}`}>
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${s.status === "WORKING" ? C.statusDot : "bg-zinc-400 dark:bg-zinc-600"}`} />
                  {s.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isWorking && (
          <Badge variant="outline" className={`text-[10px] border-0 ${C.badge}`}>
            {currentSession?.status || "STOPPED"}
          </Badge>
        )}
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 size-3.5 -translate-y-1/2 ${C.textMuted}`} />
          <Input placeholder="Search conversations" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} className={`h-9 pl-9 ${C.bgInput} ${C.border} ${C.text} text-xs placeholder:${C.textMuted} rounded-xl`} disabled={!isWorking} />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {!isWorking ? (
          <div className="py-12 text-center px-4">
            <CircleDot className={`mx-auto mb-2 size-8 ${C.textMuted}`} />
            <p className={`text-xs ${C.textSecondary} mb-1`}>Session not connected</p>
            <p className={`text-[10px] ${C.textMuted}`}>
              {currentSession?.status === "SCAN_QR_CODE" ? "Open WhatsApp → Settings → Linked Devices → Link a Device" : "Click play to start"}
            </p>
          </div>
        ) : loadingChats ? (
          <div className={`py-12 text-center text-xs ${C.textMuted}`}>Loading…</div>
        ) : filteredChats.length === 0 ? (
          <div className={`py-12 text-center text-xs ${C.textMuted}`}>No conversations</div>
        ) : (
          filteredChats.map((chat, chatIdx) => {
            const active = selectedChat?.id === chat.id
            const color = avColor(chat.id, isDark)
            return (
              <motion.button
                key={chat.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: chatIdx * 0.03 }}
                onClick={() => { setSelectedChat(chat); setChatSearch(""); setReplyingTo(null); setEditingMessage(null) }}
                className={`relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${active ? C.bgActive : C.bgHover}`}
              >
                {active && <div className={`absolute left-0 top-[20%] h-[60%] w-[3px] rounded-r-full ${C.activeBar}`} />}
                <Avatar className="size-10 shrink-0">
                  <AvatarImage src={chat.picture} />
                  <AvatarFallback className="text-xs font-semibold" style={{ background: color.bg, color: color.fg }}>{chatInitials(chat, contacts)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`truncate text-[13px] font-semibold ${C.text}`}>{chatName(chat, contacts)}</p>
                    {chat.lastMessage && <span className={`shrink-0 text-[10px] ${C.textMuted}`}>{formatTime(chat.lastMessage.timestamp)}</span>}
                  </div>
                  {chat.lastMessage && (
                    <p className={`truncate text-[11.5px] ${C.textMuted} mt-0.5`}>
                      {chat.lastMessage.fromMe && <span className={C.textSecondary}>You: </span>}{chat.lastMessage.body}
                    </p>
                  )}
                </div>
              </motion.button>
            )
          })
        )}
      </ScrollArea>
    </div>
  )

  /* ---- NO CHAT SELECTED ---- */
  if (!selectedChat) {
    return (
      <div className={`flex h-full overflow-hidden ${C.bgMain}`}>
        <ChatListPanel className="w-full md:w-80 shrink-0 h-full" />
        <div className={`hidden flex-1 md:flex items-center justify-center overflow-hidden`}>
          <div className="text-center">
            <CircleDot className={`mx-auto mb-3 size-12 ${C.textMuted}`} />
            <p className={`text-sm ${C.textSecondary}`}>Select a conversation</p>
          </div>
        </div>
        <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={handleNewChatOpen} />
        <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={loadChats} />
      </div>
    )
  }

  /* ---- MAIN CHAT VIEW ---- */
  const chatColor = avColor(selectedChat.id, isDark)

  return (
    <div className={`flex h-full overflow-hidden ${C.bgMain}`}>
      <div className="hidden md:flex w-80 shrink-0 h-full overflow-hidden"><ChatListPanel className="w-full" /></div>

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* HEADER */}
        <div className={`flex items-center gap-3 px-3 sm:px-5 py-3.5 ${C.bgHeader} border-b ${C.border}`}>
          <Button variant="ghost" size="icon" className={`md:hidden shrink-0 size-9 ${C.iconBtn}`} onClick={() => { setSelectedChat(null); setMessages([]) }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Button>
          <Avatar className="size-9 sm:size-10 shrink-0">
            <AvatarImage src={selectedChat.picture} />
            <AvatarFallback className="text-sm font-semibold" style={{ background: chatColor.bg, color: chatColor.fg }}>{chatInitials(selectedChat, contacts)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className={`text-[15px] font-semibold ${C.text} tracking-tight truncate`}>{chatName(selectedChat, contacts)}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`size-1.5 rounded-full ${C.statusDot}`} />
              <span className={`text-[11px] ${C.textAccent}`}>online</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`size-9 rounded-xl ${C.iconBtn}`} onClick={() => { if (selectedChat && selectedSession) api.archiveChat(selectedSession, selectedChat.id).then(() => { toast.success("Archived"); loadChats() }).catch(() => toast.error("Failed")) }}>
                <Archive className="size-[18px]" />
              </Button>
            </TooltipTrigger><TooltipContent>Archive</TooltipContent></Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={`size-9 rounded-xl ${C.iconBtn}`}><MoreVertical className="size-[18px]" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={`${C.bgPopover} ${C.border}`}>
                <DropdownMenuItem onClick={() => selectedSession && api.unreadChat(selectedSession, selectedChat.id).then(() => toast.success("Marked unread")).catch(() => toast.error("Failed"))} className={`${C.text} focus:${C.bgAccent}`}>
                  <MessageSquarePlus className="size-4 mr-2" /> Mark Unread
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* MESSAGES */}
        <div className={`flex-1 min-h-0 relative ${C.bgMain}`}>
          <div ref={messagesContainerRef} onScroll={handleScroll} className="absolute inset-0 overflow-auto px-5 py-4">
          <div className="space-y-3 max-w-3xl mx-auto">
            {loadingMessages && messages.length === 0 ? (
              <div className={`py-16 text-center text-xs ${C.textMuted}`}>Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className={`py-16 text-center text-xs ${C.textMuted}`}>No messages yet</div>
            ) : (
              [...messages].reverse().map((msg, idx) => {
                const prev = idx > 0 ? [...messages].reverse()[idx - 1] : null
                const showDate = shouldShowDateSeparator(msg, prev)
                const sent = msg.fromMe
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {showDate && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex justify-center my-4"
                      >
                        <span className={`text-[10.5px] font-medium ${C.datePill} px-4 py-1 rounded-full tracking-wide`}>{formatDateSeparator(msg.timestamp)}</span>
                      </motion.div>
                    )}
                    <div className={`flex flex-col ${sent ? "items-end" : "items-start"}`}>
                      <div className="relative group max-w-[75%]">
                        {msg.replyTo && (
                          <div className={`${C.bgInput} rounded-t-xl px-3 py-2 border-l-[3px] border-emerald-500 dark:border-[#4ade80] mb-0`}>
                            <p className={`text-[11px] ${C.textAccent} font-semibold`}>Reply</p>
                            <p className={`text-[12px] ${C.textMuted} truncate`}>Original message</p>
                          </div>
                        )}
                        <div className={`px-3.5 py-2.5 ${sent ? `${C.bgBubbleSent} ${C.sentText} rounded-[18px_18px_4px_18px]` : `${C.bgBubbleRecv} ${C.recvText} rounded-[4px_18px_18px_18px]`} ${msg.replyTo ? "rounded-t-none" : ""}`}>
                          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                          <div className={`flex items-center gap-1 mt-1 ${sent ? "justify-end" : "justify-start"}`}>
                            <span className={`text-[10px] ${sent ? "opacity-60" : C.textMuted}`}>{formatBubbleTime(msg.timestamp)}</span>
                            {sent && <AckIcon ack={msg.ack} />}
                          </div>
                        </div>
                        {/* reactions display */}
                        {msg.reactions && msg.reactions.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${sent ? "justify-end" : "justify-start"}`}>
                            {[...new Set(msg.reactions.map((r) => r.text))].map((emoji, i) => {
                              const count = msg.reactions!.filter((r) => r.text === emoji).length
                              return (
                                <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs ${C.bgInput} ${C.text}`}>
                                  {emoji}{count > 1 && <span className="text-[10px]">{count}</span>}
                                </span>
                              )
                            })}
                          </div>
                        )}
                        {/* hover actions - always visible on mobile, hover on desktop */}
                        <div className={`absolute top-1 ${sent ? "-left-10" : "-right-10"} flex flex-col gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity`}>
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-blue-500 hover:text-blue-400 hover:bg-blue-500/10" onClick={() => { setReplyingTo(msg); setEditingMessage(null) }}><Reply className="size-4" /></Button>
                          </TooltipTrigger><TooltipContent side={sent ? "left" : "right"}>Reply</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-amber-500 hover:text-amber-400 hover:bg-amber-500/10" onClick={(e) => setShowReactionPicker({ msgId: msg.id, x: e.clientX, y: e.clientY })}><Smile className="size-4" /></Button>
                          </TooltipTrigger><TooltipContent side={sent ? "left" : "right"}>React</TooltipContent></Tooltip>
                          {sent && (
                            <>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-violet-500 hover:text-violet-400 hover:bg-violet-500/10" onClick={() => { setEditingMessage(msg); setMessageText(msg.body); setReplyingTo(null) }}><Edit className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Edit</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => handlePin(msg.id)}><Pin className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Pin</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10" onClick={() => handleStar(msg.id)}><Star className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Star</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-red-500 hover:text-red-400 hover:bg-red-500/10" onClick={() => handleDelete(msg.id)}><Trash2 className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Delete</TooltipContent></Tooltip>
                            </>
                          )}
                          {!sent && (
                            <>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => handlePin(msg.id)}><Pin className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="right">Pin</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10" onClick={() => handleStar(msg.id)}><Star className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="right">Star</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-cyan-500 hover:text-cyan-400 hover:bg-cyan-500/10" onClick={() => handleForward(msg.id)}><Forward className="size-4" /></Button>
                              </TooltipTrigger><TooltipContent side="right">Forward</TooltipContent></Tooltip>
                            </>
                          )}
                        </div>
                      </div>
                      {showReactionPicker?.msgId === msg.id && (
                        <EmojiPickerPopup position={{ x: showReactionPicker.x, y: showReactionPicker.y }} onSelect={(emoji) => handleReaction(msg.id, emoji)} onClose={() => setShowReactionPicker(null)} />
                      )}
                    </div>
                  </motion.div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>
          </div>

          {/* scroll to bottom */}
          {showScrollButton && (
            <Button variant="outline" size="icon" className={`absolute bottom-4 right-6 size-10 rounded-full ${C.bgHeader} ${C.border} ${C.iconBtn} shadow-lg z-10`}
              onClick={() => { setShowScrollButton(false); messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }}>
              <ArrowDown className="size-4" />
            </Button>
          )}
        </div>

        {/* reply/edit bar */}
        {(replyingTo || editingMessage) && (
          <div className={`${C.bgHeader} border-t ${C.border} px-5 py-2.5 flex items-center gap-3`}>
            <div className={`w-[3px] h-8 rounded-full ${C.activeBar} shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold ${C.textAccent}`}>{editingMessage ? "Editing message" : `Replying to ${replyingTo?.fromMe ? "yourself" : "message"}`}</p>
              <p className={`text-xs ${C.textMuted} truncate`}>{editingMessage ? editingMessage.body : replyingTo?.body}</p>
            </div>
            <Button variant="ghost" size="icon" className={`size-7 shrink-0 ${C.iconBtn}`} onClick={() => { setReplyingTo(null); setEditingMessage(null); setMessageText("") }}><X className="size-4" /></Button>
          </div>
        )}

        {/* INPUT BAR */}
        <div className={`${C.bgHeader} border-t ${C.border} px-4 py-3 flex items-center gap-2.5`}>
          <div className="flex items-center gap-0.5">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`size-9 rounded-xl ${C.iconBtn}`} onClick={() => setMediaDialog({ open: true, type: "image" })} disabled={!isWorking}><ImageIcon className="size-5" /></Button>
            </TooltipTrigger><TooltipContent>Image</TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={`size-9 rounded-xl ${C.iconBtn}`} onClick={() => setMediaDialog({ open: true, type: "file" })} disabled={!isWorking}><Paperclip className="size-5" /></Button>
            </TooltipTrigger><TooltipContent>File</TooltipContent></Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className={`size-9 rounded-xl ${C.iconBtn}`} disabled={!isWorking}><ChevronDown className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={`${C.bgPopover} ${C.border}`}>
                <DropdownMenuItem onClick={() => setMediaDialog({ open: true, type: "voice" })} className={`${C.text} focus:${C.bgAccent}`}><Mic className="size-4 mr-2" /> Voice Message</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMediaDialog({ open: true, type: "video" })} className={`${C.text} focus:${C.bgAccent}`}><Camera className="size-4 mr-2" /> Video</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMediaDialog({ open: true, type: "location" })} className={`${C.text} focus:${C.bgAccent}`}><MapPin className="size-4 mr-2" /> Location</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMediaDialog({ open: true, type: "poll" })} className={`${C.text} focus:${C.bgAccent}`}><BarChart3 className="size-4 mr-2" /> Poll</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex-1">
            <Input value={messageText} onChange={(e) => { setMessageText(e.target.value); handleTyping() }} onKeyDown={handleKeyDown}
              placeholder={isWorking ? (editingMessage ? "Edit message…" : "Type a message…") : "Start the session first"}
              className={`h-10 ${C.bgInput} ${C.border} ${C.text} text-[13.5px] placeholder:${C.textMuted} rounded-2xl px-4`} disabled={!isWorking} />
          </div>
          <Tooltip><TooltipTrigger asChild>
            <Button size="icon" className={`size-10 rounded-xl ${C.accentBg} text-white ${C.accentHover} shrink-0`} onClick={handleSend} disabled={!messageText.trim() || !isWorking}>
              <Send className="size-[18px]" />
            </Button>
          </TooltipTrigger><TooltipContent>Send</TooltipContent></Tooltip>
        </div>
      </div>

      <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} session={selectedSession} onOpenChat={handleNewChatOpen} />
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} session={selectedSession} onSent={loadChats} />
      <SendMediaDialog open={mediaDialog.open} onOpenChange={(v) => setMediaDialog((p) => ({ ...p, open: v }))} type={mediaDialog.type} session={selectedSession} chatId={selectedChat.id} onSent={() => { loadMessages(selectedChat.id); loadChats() }} />
    </div>
  )
}

import { useEffect, useRef } from "react"
import { Archive, ChevronLeft, MoreVertical, MessageSquarePlus, Search, Star, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ChatOverview, Contact } from "@/lib/api"
import { avColor, chatAddress, chatName, chatInitials } from "./helpers"

interface ChatHeaderProps {
  chat: ChatOverview
  contacts: Map<string, Contact>
  picture?: string
  /** Presence of the open chat: available | composing | recording | unavailable… */
  presence?: string
  /** True while the contact is typing (kept separate from presence for clarity). */
  typing?: boolean
  onBack: () => void
  onArchive: () => void
  onMarkUnread: () => void
  /** In-chat search; null while closed. */
  search: string | null
  onSearchChange: (value: string | null) => void
  starredOnly: boolean
  onToggleStarredOnly: () => void
}

export function ChatHeader({
  chat,
  contacts,
  picture,
  presence,
  typing,
  onBack,
  onArchive,
  onMarkUnread,
  search,
  onSearchChange,
  starredOnly,
  onToggleStarredOnly,
}: ChatHeaderProps) {
  const searchRef = useRef<HTMLInputElement>(null)
  const searching = search !== null
  useEffect(() => {
    if (searching) searchRef.current?.focus()
  }, [searching])
  const color = avColor(chat.id, false)
  const online = presence === "available"
  const showTyping = typing || presence === "composing"
  const showRecording = !showTyping && presence === "recording"

  return (
    <header className="z-10 flex h-[var(--chat-header-height)] shrink-0 items-center gap-3 border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)] px-3 md:px-4">
      <button
        onClick={onBack}
        aria-label="Back to conversations"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)] md:hidden"
      >
        <ChevronLeft className="size-5" strokeWidth={1.75} />
      </button>

      <div className="relative shrink-0">
        <Avatar className="size-10">
          <AvatarImage src={picture || chat.picture} />
          <AvatarFallback className="text-xs" style={{ background: color.bg, color: color.fg }}>
            {chatInitials(chat, contacts)}
          </AvatarFallback>
        </Avatar>
        {online && (
          <span
            className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-[var(--chat-bg-header)] bg-[var(--chat-green)]"
            aria-label="Online"
          />
        )}
      </div>

      <div className={`min-w-0 flex-1 flex-col ${searching ? "hidden sm:flex" : "flex"}`}>
        <span className="truncate text-[16px] font-bold leading-[21px] text-[var(--chat-text-primary)]">
          {chatName(chat, contacts)}
        </span>
        {showTyping ? (
          <span className="truncate text-[13px] leading-[18px] text-[var(--chat-accent)]" aria-live="polite">
            typing…
          </span>
        ) : showRecording ? (
          <span className="truncate text-[13px] leading-[18px] text-[var(--chat-accent)]" aria-live="polite">
            recording audio…
          </span>
        ) : online ? (
          <span className="flex items-center gap-1.5 truncate text-[13px] leading-[18px] text-[var(--chat-green)]" aria-live="polite">
            <span className="size-1.5 rounded-full bg-[var(--chat-green)]" />
            online
          </span>
        ) : (
          <span className="metric truncate text-[13px] leading-[18px] text-[var(--chat-accent)]">
            {chatAddress(chat, contacts)}
          </span>
        )}
      </div>

      {searching && (
        <div className="flex min-w-0 flex-[2] items-center gap-2 rounded-full bg-[var(--chat-bg-input)] px-3 py-1.5">
          <Search className="size-4 shrink-0 text-[var(--chat-text-tertiary)]" strokeWidth={1.75} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onSearchChange(null) }}
            placeholder="Search this chat"
            aria-label="Search this chat"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-tertiary)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onSearchChange(null)}
            aria-label="Close search"
            className="text-[var(--chat-text-tertiary)] hover:text-[var(--chat-text-primary)]"
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {!searching && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Search this chat"
                variant="ghost"
                size="icon"
                className="size-9 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
                onClick={() => onSearchChange("")}
              >
                <Search className="size-[18px]" strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search this chat</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={starredOnly ? "Show all messages" : "Show starred messages"}
              aria-pressed={starredOnly}
              variant="ghost"
              size="icon"
              className={`size-9 rounded-full hover:bg-[var(--chat-bg-hover)] ${
                starredOnly ? "text-[var(--chat-orange)]" : "text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)]"
              }`}
              onClick={onToggleStarredOnly}
            >
              <Star className={`size-[18px] ${starredOnly ? "fill-current" : ""}`} strokeWidth={1.75} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{starredOnly ? "Show all messages" : "Starred messages"}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="More options"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
            >
              <MoreVertical className="size-[18px]" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[170px]">
            <DropdownMenuItem onClick={onMarkUnread} className="cursor-pointer">
              <MessageSquarePlus strokeWidth={1.75} /> Mark unread
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive} className="cursor-pointer">
              <Archive strokeWidth={1.75} /> Archive chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

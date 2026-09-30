import { Archive, ChevronLeft, MoreVertical, MessageSquarePlus } from "lucide-react"
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
import { avColor, chatName, chatInitials } from "./helpers"

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
}: ChatHeaderProps) {
  const color = avColor(chat.id, false)
  const online = presence === "available"
  const showTyping = typing || presence === "composing"
  const showRecording = !showTyping && presence === "recording"

  return (
    <header className="z-10 flex items-center gap-3 border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)] px-3 py-2 md:px-4">
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

      <div className="flex min-w-0 flex-1 flex-col">
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
            {chat.id.split("@")[0]}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Archive chat"
              variant="ghost"
              size="icon"
              className="size-9 rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)]"
              onClick={onArchive}
            >
              <Archive className="size-[18px]" strokeWidth={1.75} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive</TooltipContent>
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
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuItem onClick={onMarkUnread} className="cursor-pointer text-xs">
              <MessageSquarePlus className="size-3.5 mr-2" strokeWidth={1.75} /> Mark unread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

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
  onBack: () => void
  onArchive: () => void
  onMarkUnread: () => void
}

export function ChatHeader({
  chat,
  contacts,
  picture,
  onBack,
  onArchive,
  onMarkUnread,
}: ChatHeaderProps) {
  const color = avColor(chat.id, false)

  return (
    <header className="z-10 flex items-center gap-3 border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)] px-3 py-2 md:px-4">
      <button
        onClick={onBack}
        aria-label="Back to conversations"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--chat-text-secondary)] hover:bg-[var(--chat-bg-hover)] hover:text-[var(--chat-text-primary)] md:hidden"
      >
        <ChevronLeft className="size-5" strokeWidth={1.75} />
      </button>

      <Avatar className="size-10 shrink-0">
        <AvatarImage src={picture || chat.picture} />
        <AvatarFallback className="text-xs" style={{ background: color.bg, color: color.fg }}>
          {chatInitials(chat, contacts)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] font-bold leading-[21px] text-[var(--chat-text-primary)]">
          {chatName(chat, contacts)}
        </span>
        <span className="metric truncate text-[13px] leading-[18px] text-[var(--chat-accent)]">
          {chat.id.split("@")[0]}
        </span>
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

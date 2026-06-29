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
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--chat-border)] bg-[var(--chat-bg-header)] px-4 py-3 backdrop-blur-[20px] backdrop-saturate-[180%]">
      <button
        onClick={onBack}
        className="mr-1 text-[var(--chat-text-secondary)] hover:text-[var(--chat-text-primary)] md:hidden"
      >
        <ChevronLeft className="size-5" />
      </button>

      <Avatar className="size-9 shrink-0">
        <AvatarImage src={picture || chat.picture} />
        <AvatarFallback className="text-xs font-semibold" style={{ background: color.bg, color: color.fg }}>
          {chatInitials(chat, contacts)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[var(--chat-text-primary)]">
          {chatName(chat, contacts)}
        </span>
        <span className="truncate text-[12px] text-[var(--chat-text-secondary)]">
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            online
          </span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-[var(--chat-text-secondary)] hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
              onClick={onArchive}
            >
              <Archive className="size-[16px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-[var(--chat-text-secondary)] hover:bg-[var(--chat-accent-soft)] hover:text-[var(--chat-text-primary)]"
            >
              <MoreVertical className="size-[16px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem onClick={onMarkUnread} className="cursor-pointer text-xs">
              <MessageSquarePlus className="size-3.5 mr-2" /> Mark Unread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

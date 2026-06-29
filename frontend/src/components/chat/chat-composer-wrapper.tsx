import { ChatComposer } from "@/components/ui/chat"
import type { ChatMessageData } from "@/components/ui/chat"

interface ChatComposerWrapperProps {
  onSend: (text: string) => void
  onTyping?: (isTyping: boolean) => void
  onFileUpload?: (files: File[]) => void
  placeholder?: string
  disabled?: boolean
  replyingTo?: ChatMessageData | null
  onCancelReply?: () => void
  onOpenMediaDialog: (type: "image" | "file" | "voice" | "video" | "location" | "poll") => void
  onVoiceRecorded?: (base64: string, mimetype: string) => void
}

export function ChatComposerWrapper({
  onSend,
  onTyping,
  onFileUpload,
  placeholder = "Type a message...",
  disabled = false,
  replyingTo,
  onCancelReply,
  onOpenMediaDialog,
  onVoiceRecorded,
}: ChatComposerWrapperProps) {
  return (
    <div className="relative">
      <ChatComposer
        onSend={onSend}
        onTyping={onTyping}
        onFileUpload={onFileUpload}
        placeholder={placeholder}
        disabled={disabled}
        replyingTo={replyingTo}
        onCancelReply={onCancelReply}
        onOpenMediaDialog={onOpenMediaDialog}
        onVoiceRecorded={onVoiceRecorded}
      />
    </div>
  )
}

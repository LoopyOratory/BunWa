export class MessageTextRequest {
  session?: string;
  chatId!: string;
  text!: string;
  mentions?: string[];
  reply_to?: string;
  linkPreview?: boolean;
  linkPreviewHighQuality?: boolean;
}

export class MessageImageRequest {
  session?: string;
  chatId!: string;
  file: any;
  caption?: string;
  mentions?: string[];
  reply_to?: string;
}

export class MessageFileRequest {
  session?: string;
  chatId!: string;
  file: any;
  caption?: string;
  mentions?: string[];
  reply_to?: string;
}

export class MessageVoiceRequest {
  session?: string;
  chatId!: string;
  file: any;
  reply_to?: string;
  convert?: boolean;
}

export class MessageVideoRequest {
  session?: string;
  chatId!: string;
  file: any;
  caption?: string;
  mentions?: string[];
  reply_to?: string;
  asNote?: boolean;
  convert?: boolean;
}

export class MessageLocationRequest {
  session?: string;
  chatId!: string;
  latitude!: number;
  longitude!: number;
  title?: string;
  reply_to?: string;
}

export class MessageForwardRequest {
  session?: string;
  chatId!: string;
  messageId!: string;
}

export class MessageReactionRequest {
  session?: string;
  chatId!: string;
  messageId!: string;
  reaction!: string;
}

export class MessageStarRequest {
  session?: string;
  chatId!: string;
  messageId!: string;
  star!: boolean;
}

export class MessagePollRequest {
  session?: string;
  chatId!: string;
  poll: any;
  reply_to?: string;
}

export class MessagePollVoteRequest {
  session?: string;
  chatId!: string;
  pollMessageId!: string;
  pollServerId?: string;
  votes!: string[];
}

export class MessageContactVcardRequest {
  session?: string;
  chatId!: string;
  contacts!: any[];
  reply_to?: string;
}

export class MessageLinkPreviewRequest {
  session?: string;
  chatId!: string;
  url!: string;
  title?: string;
}

export class MessageLinkCustomPreviewRequest {
  session?: string;
  chatId!: string;
  text!: string;
  linkPreviewHighQuality?: boolean;
  preview: any;
  reply_to?: string;
}

export class MessageButtonReply {
  session?: string;
  chatId!: string;
  replyTo?: string;
  selectedDisplayText!: string;
  selectedButtonID!: string;
}

export class EditMessageRequest {
  text!: string;
  mentions?: string[];
  linkPreview?: boolean;
  linkPreviewHighQuality?: boolean;
}

export class MessageReplyRequest extends MessageTextRequest {}

export class SendSeenRequest {
  session?: string;
  chatId!: string;
  messageId?: string;
  messageIds?: string[];
  participant?: string;
}

export class ChatRequest {
  session?: string;
  chatId!: string;
}

export class CheckNumberStatusQuery {
  session?: string;
  phone!: string;
}

export class SendListRequest {
  session?: string;
  chatId!: string;
  title!: string;
  description!: string;
  button!: string;
  sections!: any[];
}

/**
 * How to read a checkNumberStatus / check-exists answer:
 *   - resolved: WhatsApp returned an identity for the target and its reachability
 *   - not_resolvable: WhatsApp answered that the target is not registered; this
 *     is a negative answer from the protocol, not an absence of one
 *   - could_not_check: no usable answer (the engine cannot look it up, the query
 *     failed, or WhatsApp returned an empty answer). This is NOT proof that the
 *     target is absent, so callers must not present it as one.
 */
export type WaCheckStatus = 'resolved' | 'not_resolvable' | 'could_not_check';

export class WANumberExistResult {
  /** true when resolved, false when not_resolvable, null when could_not_check. */
  exists!: boolean | null;
  isBusiness!: boolean;
  canReceiveMessage!: boolean;
  /**
   * The resolved address when one exists. For a phone check that is the
   * `<phone>@c.us` form; for a username it is the user's `<lid>@lid` privacy id,
   * because a username resolves to a LID and the phone number is not revealed.
   * When nothing resolved this carries the queried target.
   */
  number!: string;
  /** Explicit outcome; see WaCheckStatus. Absent only on older-shaped answers. */
  status?: WaCheckStatus;
  /** Why the target could not be resolved, when status is not 'resolved'. */
  reason?: string;
  /** Username checks only: the handle that was looked up. */
  username?: string;
  /** Username checks only: the username state WhatsApp reports, for example 'active'. */
  usernameState?: string | null;
  /** Username checks only: the resolved privacy id (LID) address. */
  lid?: string | null;
  /** Username checks only: the display name known locally for the LID, when any. */
  pushName?: string | null;
}

export class MessageDestination {
  id!: string;
  to?: string | null;
  from?: string | null;
  fromMe?: boolean;
  session?: string;
  chatId?: string;
}

export class MessageTextRequest {
  session?: string;
  chatId: string;
  text: string;
  mentions?: string[];
  reply_to?: string;
  linkPreview?: boolean;
  linkPreviewHighQuality?: boolean;
}

export class MessageImageRequest {
  session?: string;
  chatId: string;
  file: any;
  caption?: string;
  mentions?: string[];
  reply_to?: string;
}

export class MessageFileRequest {
  session?: string;
  chatId: string;
  file: any;
  caption?: string;
  mentions?: string[];
  reply_to?: string;
}

export class MessageVoiceRequest {
  session?: string;
  chatId: string;
  file: any;
  reply_to?: string;
  convert?: boolean;
}

export class MessageVideoRequest {
  session?: string;
  chatId: string;
  file: any;
  caption?: string;
  mentions?: string[];
  reply_to?: string;
  asNote?: boolean;
  convert?: boolean;
}

export class MessageLocationRequest {
  session?: string;
  chatId: string;
  latitude: number;
  longitude: number;
  title?: string;
  reply_to?: string;
}

export class MessageForwardRequest {
  session?: string;
  chatId: string;
  messageId: string;
}

export class MessageReactionRequest {
  session?: string;
  chatId: string;
  messageId: string;
  reaction: string;
}

export class MessageStarRequest {
  session?: string;
  chatId: string;
  messageId: string;
  star: boolean;
}

export class MessagePollRequest {
  session?: string;
  chatId: string;
  poll: any;
  reply_to?: string;
}

export class MessagePollVoteRequest {
  session?: string;
  chatId: string;
  pollMessageId: string;
  pollServerId?: string;
  votes: string[];
}

export class MessageContactVcardRequest {
  session?: string;
  chatId: string;
  contacts: any[];
  reply_to?: string;
}

export class MessageLinkPreviewRequest {
  session?: string;
  chatId: string;
  url: string;
  title?: string;
}

export class MessageLinkCustomPreviewRequest {
  session?: string;
  chatId: string;
  text: string;
  linkPreviewHighQuality?: boolean;
  preview: any;
  reply_to?: string;
}

export class MessageButtonReply {
  session?: string;
  chatId: string;
  replyTo?: string;
  selectedDisplayText: string;
  selectedButtonID: string;
}

export class EditMessageRequest {
  text: string;
  mentions?: string[];
  linkPreview?: boolean;
  linkPreviewHighQuality?: boolean;
}

export class MessageReplyRequest extends MessageTextRequest {
  text: string;
}

export class SendSeenRequest {
  session?: string;
  chatId: string;
  messageId?: string;
  messageIds?: string[];
  participant?: string;
}

export class ChatRequest {
  session?: string;
  chatId: string;
}

export class CheckNumberStatusQuery {
  session?: string;
  phone: string;
}

export class SendListRequest {
  session?: string;
  chatId: string;
  title: string;
  description: string;
  button: string;
  sections: any[];
}

export class WANumberExistResult {
  exists: boolean;
  isBusiness: boolean;
  canReceiveMessage: boolean;
  number: string;
}

export class MessageDestination {
  session?: string;
  chatId: string;
}

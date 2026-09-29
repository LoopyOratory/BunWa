export enum MessageSource {
  API = 'api',
  APP = 'app',
}

export class WAMessageBase {
  id!: string;
  timestamp!: number;
  from!: string;
  fromMe!: boolean;
  source!: string;
  to!: string;
  participant?: string;
}

export class WAMessage extends WAMessageBase {
  body?: string | null;
  hasMedia?: boolean;
  media?: any;
  mediaUrl?: string;
  ack?: number;
  ackName?: string;
  author?: string;
  location?: any;
  vCards?: string[] | null;
  replyTo?: any;
  reactions?: any[];
  interactive?: WAMessageInteractiveReply | null;
  _data?: any;
}

/**
 * Structured selection from an interactive reply (button tap, list row pick
 * or native-flow response). Surfaced on WAMessage.interactive alongside the
 * plain-text body so consumers can act on the id, not the label.
 */
export interface WAMessageInteractiveReply {
  type: 'button' | 'list' | 'flow';
  selectedId: string | null;
  selectedText: string | null;
  repliedToMessageId: string | null;
}

export class WAReaction {
  text!: string;
  messageId!: string;
}

export class WAMessageReaction extends WAMessageBase {
  reaction!: WAReaction;
}

export class WALocation {
  latitude!: number;
  longitude!: number;
  live?: boolean;
  name?: string;
  address?: string;
  url?: string;
  description?: string;
  thumbnail?: string;
}

export class ReplyToMessage {
  id!: string;
  participant?: string;
  body?: string | null;
  hasMedia?: boolean;
  media?: any;
  _data?: any;
}

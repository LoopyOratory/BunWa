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
  _data?: any;
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

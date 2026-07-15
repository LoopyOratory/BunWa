export class ChatSummary {
  id!: string;
  name?: string | null;
  picture?: string | null;
  lastMessage?: any;
  _chat?: any;
}

export class GetChatMessagesFilter {
  timestamp?: {
    lte?: number;
    gte?: number;
  };
  fromMe?: boolean;
  ack?: number[];
  'filter.timestamp.lte'?: number;
  'filter.timestamp.gte'?: number;
  'filter.fromMe'?: boolean;
  'filter.ack'?: number;
}

export class GetChatMessagesQuery {
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
  downloadMedia?: boolean;
  merge?: boolean;
}

export class GetChatMessageQuery {
  downloadMedia?: boolean;
  merge?: boolean;
}

export class ReadChatMessagesQuery {
  messages?: string[];
  days?: number;
}

export class ReadChatMessagesResponse {
  ids?: string[];
}

export class GetChatsParams {
  limit?: number;
  offset?: number;
  merge?: boolean;
}

export class GetChatsOverviewParams {
  limit?: number;
  offset?: number;
  merge?: boolean;
}

export class OverviewFilter {
  ids?: string[];
}

export class OverviewBodyRequest {
  pagination: any;
  filter: any;
}

export enum PinDuration {
  DAY = 86400,
  WEEK = 604800,
  MONTH = 2592000,
}

export class PinMessageRequest {
  duration?: number;
}

export class ChatPictureQuery {
  refresh?: boolean;
}

export class ChatPictureResponse {
  url?: string;
}

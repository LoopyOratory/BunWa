export class ChatSummary {
  id: string;
  name?: string;
  picture?: string;
  lastMessage?: any;
}

export class GetChatMessagesFilter {
  timestamp?: {
    lte?: number;
    gte?: number;
  };
  fromMe?: boolean;
  ack?: number[];
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
}

export class GetChatsOverviewParams {
  limit?: number;
  offset?: number;
}

export class OverviewFilter {
  // placeholder
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

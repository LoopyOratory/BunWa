export class Channel {
  id!: string;
  name!: string;
  description?: string;
  invite?: string;
  picture?: string;
  preview?: string;
  verified?: boolean;
  subscribersCount?: number;
  role?: string;
}

export class CreateChannelRequest {
  name!: string;
  description?: string;
  picture?: string;
}

export class ListChannelsQuery {
  limit?: number;
  offset?: number;
}

export class ChannelListResult {
  channels!: Channel[];
  page: any;
}

export class ChannelMessage {
  message: any;
  reactions?: any[];
  viewCount?: number;
}

export class ChannelSearchByView {
  limit?: number;
  startCursor?: string;
  view?: string;
  countries?: string[];
  categories?: string[];
}

export class ChannelSearchByText {
  limit?: number;
  startCursor?: string;
  text?: string;
  categories?: string[];
}

export class PreviewChannelMessages {
  downloadMedia?: boolean;
  limit?: number;
}

export enum ChannelRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  SUBSCRIBER = 'subscriber',
  GUEST = 'guest',
}

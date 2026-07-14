import { WAMessage } from './responses.dto';

export class WAHAWebhook<Payload = any> {
  id!: string;
  timestamp!: number;
  event!: string;
  session!: string;
  metadata?: Record<string, any>;
  engine?: string;
  me?: any;
  environment?: any;
  payload!: Payload;
}

export class SessionStatusPoint {
  status!: string;
  timestamp!: number;
}

export class WASessionStatusBody {
  statuses!: SessionStatusPoint[];
}

export class WAMessageAckBody {
  id!: string;
  from?: any;
  to?: any;
  participant?: any;
  fromMe?: boolean;
  ack!: number;
  ackName?: string;
  key?: any;
  _data?: any;
}

export class PollVote {
  chatId!: string;
  messageId!: string;
  pollServerId!: string;
  votes!: string[];
}

export class PollVotePayload {
  vote!: PollVote;
}

export class WAMessageRevokedBody {
  after: any;
  before: any;
  revokedMessageId?: string;
  _data?: any;
}

export class WAMessageEditedBody extends WAMessage {
  editedMessageId?: string;
}

export class EnginePayload {
  engine!: string;
  event!: string;
  session!: string;
  data: any;
}

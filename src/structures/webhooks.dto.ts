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
  ack!: number;
  key: any;
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
  key: any;
  message: any;
}

export class WAMessageEditedBody {
  key: any;
  message: any;
}

export class EnginePayload {
  engine!: string;
  event!: string;
  session!: string;
  data: any;
}

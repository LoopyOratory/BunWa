export class RejectCallRequest {
  from: string;
  callId: string;
}

export class CallData {
  id: string;
  from?: string;
  timestamp: number;
  isVideo: boolean;
  isGroup: boolean;
}

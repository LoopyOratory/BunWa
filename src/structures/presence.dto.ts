export class WAHAPresenceData {
  lastSeen?: number;
  status?: string;
}

export class WAHAChatPresences {
  chatId!: string;
  presences!: Record<string, WAHAPresenceData>;
}

export class WAHASessionPresence {
  presence!: string;
  chatId?: string;
}

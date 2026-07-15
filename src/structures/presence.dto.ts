export class WAHAPresenceData {
  participant?: string;
  lastKnownPresence?: string;
  lastSeen?: number | null;
  status?: string;
}

export class WAHAChatPresences {
  id?: string;
  chatId?: string;
  presences!: WAHAPresenceData[] | Record<string, WAHAPresenceData>;
}

export class WAHASessionPresence {
  presence!: string;
  chatId?: string;
}

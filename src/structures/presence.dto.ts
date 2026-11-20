export class BUNWAPresenceData {
  participant?: string;
  lastKnownPresence?: string;
  lastSeen?: number | null;
  status?: string;
}

export class BUNWAChatPresences {
  id?: string;
  chatId?: string;
  presences!: BUNWAPresenceData[] | Record<string, BUNWAPresenceData>;
}

export class BUNWASessionPresence {
  presence!: string;
  chatId?: string;
}

export const SECOND = 1000;

export enum BUNWAEvents {
  SESSION_STATUS = 'session.status',
  SESSION_SYNC = 'session.sync',
  MESSAGE = 'message',
  MESSAGE_REACTION = 'message.reaction',
  MESSAGE_ANY = 'message.any',
  MESSAGE_ACK = 'message.ack',
  MESSAGE_ACK_GROUP = 'message.ack.group',
  MESSAGE_WAITING = 'message.waiting',
  MESSAGE_REVOKED = 'message.revoked',
  MESSAGE_EDITED = 'message.edited',
  STATE_CHANGE = 'state.change',
  GROUP_JOIN = 'group.join',
  GROUP_LEAVE = 'group.leave',
  GROUP_V2_JOIN = 'group.v2.join',
  GROUP_V2_LEAVE = 'group.v2.leave',
  GROUP_V2_UPDATE = 'group.v2.update',
  GROUP_V2_PARTICIPANTS = 'group.v2.participants',
  PRESENCE_UPDATE = 'presence.update',
  POLL_VOTE = 'poll.vote',
  POLL_VOTE_FAILED = 'poll.vote.failed',
  CHAT_ARCHIVE = 'chat.archive',
  CALL_RECEIVED = 'call.received',
  CALL_ACCEPTED = 'call.accepted',
  CALL_REJECTED = 'call.rejected',
  LABEL_UPSERT = 'label.upsert',
  LABEL_DELETED = 'label.deleted',
  LABEL_CHAT_ADDED = 'label.chat.added',
  LABEL_CHAT_DELETED = 'label.chat.deleted',
  EVENT_RESPONSE = 'event.response',
  EVENT_RESPONSE_FAILED = 'event.response.failed',
  ENGINE_EVENT = 'engine.event',
}

export type AllEventType = BUNWAEvents | '*';
export const AllEvents = [...Object.values(BUNWAEvents), '*'];

export const BUNWAEventsWild = Object.values(BUNWAEvents).filter(
  (e) => e !== BUNWAEvents.STATE_CHANGE && e !== BUNWAEvents.ENGINE_EVENT,
);

export enum BUNWASessionStatus {
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  SCAN_QR_CODE = 'SCAN_QR_CODE',
  WORKING = 'WORKING',
  FAILED = 'FAILED',
}

export enum BUNWAEngine {
  WEBJS = 'WEBJS',
  WPP = 'WPP',
  BUNWEB = 'BUNWEB',
  GOWS = 'GOWS',
  /**
   * Legacy spelling from before the engine was renamed to BUNWEB. Old
   * session configs and API requests that still say 'NOWEB' are normalized
   * to BUNWEB at every input point (see normalizeBunwaEngine); nothing new
   * should write this value.
   */
  NOWEB = 'NOWEB',
}

/** Map any accepted engine spelling to the canonical member. */
export function normalizeBunwaEngine(raw: string | undefined | null): BUNWAEngine {
  const value = String(raw ?? '').trim().toUpperCase();
  if (value === 'NOWEB') return BUNWAEngine.BUNWEB;
  if (value === 'WEBJS') return BUNWAEngine.WEBJS;
  if (value === 'WPP') return BUNWAEngine.WPP;
  if (value === 'GOWS') return BUNWAEngine.GOWS;
  return BUNWAEngine.BUNWEB;
}

export enum BUNWAPresenceStatus {
  OFFLINE = 'offline',
  ONLINE = 'online',
  TYPING = 'typing',
  RECORDING = 'recording',
  PAUSED = 'paused',
}

export enum WAMessageAck {
  ERROR = -1,
  PENDING = 0,
  SERVER = 1,
  DEVICE = 2,
  READ = 3,
  PLAYED = 4,
}

export enum WAMessageAckName {
  ERROR = 'ERROR',
  PENDING = 'PENDING',
  SERVER = 'SERVER',
  DEVICE = 'DEVICE',
  READ = 'READ',
  PLAYED = 'PLAYED',
}

export const ACK_UNKNOWN = 'UNKNOWN';

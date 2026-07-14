export class GroupV2JoinEvent {
  timestamp!: number;
  group: any;
  _data?: any;
}

export class GroupV2LeaveEvent {
  timestamp!: number;
  group: any;
  _data?: any;
}

export class GroupV2UpdateEvent {
  timestamp!: number;
  group: any;
  _data?: any;
}

export class GroupV2ParticipantsEvent {
  group: any;
  type?: GroupParticipantType;
  timestamp!: number;
  participants: any;
  _data?: any;
}

export enum GroupParticipantType {
  JOIN = 'join',
  LEAVE = 'leave',
  PROMOTE = 'promote',
  DEMOTE = 'demote',
}

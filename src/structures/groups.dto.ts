export class CreateGroupRequest {
  name: string;
  participants: string[];
}

export enum GroupField {
  NONE = '',
  PARTICIPANTS = 'participants',
}

export enum GroupParticipantRole {
  LEFT = 'left',
  PARTICIPANT = 'participant',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

export class GroupParticipant {
  id: string;
  pn?: string;
  role?: string;
}

export class GroupsListFields {
  participants?: boolean;
}

export class ParticipantsRequest {
  participants: string[];
}

export class SettingsSecurityChangeInfo {
  adminsOnly: boolean;
}

export class GroupInfo {
  id: string;
  subject: string;
  description?: string;
  participants: GroupParticipant[];
}

export class GroupsPaginationParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: string;
}

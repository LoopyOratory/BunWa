export class EventLocation {
  name!: string;
}

export class EventMessage {
  name!: string;
  description?: string;
  /** Unix time in seconds. */
  startTime!: number;
  /** Unix time in seconds. */
  endTime?: number;
  location?: EventLocation;
  extraGuestsAllowed?: boolean;
}

export class EventMessageRequest {
  session?: string;
  chatId!: string;
  reply_to?: string;
  event!: EventMessage;
}

export class EventCancelRequest {
  eventId!: string;
}

export class EventResponse {
  // placeholder
}

export class EventResponsePayload {
  // placeholder
}

export enum EventResponseType {
  // placeholder
}

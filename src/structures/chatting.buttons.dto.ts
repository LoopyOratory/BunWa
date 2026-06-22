export class SendButtonsRequest {
  session?: string;
  chatId: string;
  buttons: any[];
}

export enum ButtonType {
  REPLY = 'reply',
  URL = 'url',
  CALL = 'call',
  COPY = 'copy',
}

export class Button {
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
  displayText?: string;
}

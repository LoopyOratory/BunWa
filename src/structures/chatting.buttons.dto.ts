export class SendButtonsRequest {
  session?: string;
  chatId!: string;
  buttons!: Button[];
  header?: string;
  headerImage?: any;
  body?: string;
  footer?: string;
}

export enum ButtonType {
  REPLY = 'reply',
  URL = 'url',
  CALL = 'call',
  COPY = 'copy',
}

export class Button {
  type!: ButtonType;
  text!: string;
  id?: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
  displayText?: string;
}

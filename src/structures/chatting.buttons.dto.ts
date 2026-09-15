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
  /** Opens the account's WhatsApp catalog. */
  CATALOG = 'catalog',
  /** Shares a static location. */
  LOCATION = 'location',
  /** Launches a WhatsApp Flow published in Meta Business Manager. */
  FLOW = 'flow',
}

export class Button {
  type!: ButtonType;
  text!: string;
  id?: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
  displayText?: string;
  /** Catalog ID for catalog buttons; omit to open the account catalog. */
  catalogId?: string;
  /** Published Flow ID for flow buttons. */
  flowId?: string;
  /** Flow token handed to the flow endpoint. */
  flowToken?: string;
  /** Flow action, navigate (default) or data_exchange. */
  flowAction?: string;
  /** Label shown on a flow button; defaults to the button text. */
  flowCta?: string;
}

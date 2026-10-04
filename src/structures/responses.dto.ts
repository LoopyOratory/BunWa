export enum MessageSource {
  API = 'api',
  APP = 'app',
}

export class WAMessageBase {
  id!: string;
  timestamp!: number;
  from!: string;
  fromMe!: boolean;
  source!: string;
  to!: string;
  participant?: string;
}

export class WAMessage extends WAMessageBase {
  body?: string | null;
  hasMedia?: boolean;
  media?: any;
  mediaUrl?: string;
  ack?: number;
  ackName?: string;
  author?: string;
  location?: any;
  vCards?: string[] | null;
  replyTo?: any;
  reactions?: any[];
  interactive?: WAMessageInteractiveReply | null;
  /**
   * WhatsApp message kind, for example text, image, order or product. The
   * values match the enum webhook filters accept, so a workflow can branch on
   * a commerce message without decoding `_data`.
   */
  type?: string | null;
  /** Parsed payload of an inbound order message (orderMessage). */
  order?: WAMessageOrder | null;
  /** Parsed payload of an inbound product message (productMessage). */
  product?: WAMessageProduct | null;
  /**
   * WhatsApp username of the sender, when the message arrived with one
   * (username addressing). Null when the protocol carried no handle.
   */
  username?: string | null;
  _data?: any;
}

/**
 * One inbound WhatsApp order (a cart shared from a business catalog). The
 * cart lines themselves arrive as the free-form `message` text; the proto
 * carries no per-item array, so `message` is the order summary to display.
 */
export interface WAMessageOrder {
  orderId: string | null;
  itemCount: number | null;
  status: string | null;
  surface: string | null;
  /** Order summary text, one cart line per row. */
  message: string | null;
  orderTitle: string | null;
  sellerJid: string | null;
  token: string | null;
  /** Decimal amount in the order currency (totalAmount1000 / 1000). */
  totalAmount: number | null;
  currencyCode: string | null;
  messageVersion: number | null;
  catalogType: string | null;
}

/** One inbound product card (a catalog entry shared into the chat). */
export interface WAMessageProduct {
  productId: string | null;
  title: string | null;
  description: string | null;
  currencyCode: string | null;
  /** Decimal price in the product currency (priceAmount1000 / 1000). */
  price: number | null;
  /** Decimal sale price when set (salePriceAmount1000 / 1000). */
  salePrice: number | null;
  retailerId: string | null;
  url: string | null;
  businessOwnerJid: string | null;
  body: string | null;
  footer: string | null;
}

/**
 * Structured selection from an interactive reply (button tap, list row pick
 * or native-flow response). Surfaced on WAMessage.interactive alongside the
 * plain-text body so consumers can act on the id, not the label.
 */
export interface WAMessageInteractiveReply {
  type: 'button' | 'list' | 'flow';
  selectedId: string | null;
  selectedText: string | null;
  repliedToMessageId: string | null;
}

export class WAReaction {
  text!: string;
  messageId!: string;
}

export class WAMessageReaction extends WAMessageBase {
  reaction!: WAReaction;
}

export class WALocation {
  latitude!: number;
  longitude!: number;
  live?: boolean;
  name?: string;
  address?: string;
  url?: string;
  description?: string;
  thumbnail?: string;
}

export class ReplyToMessage {
  id!: string;
  participant?: string;
  body?: string | null;
  hasMedia?: boolean;
  media?: any;
  _data?: any;
}

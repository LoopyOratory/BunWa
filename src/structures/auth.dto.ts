export class QRCodeQuery {
  format?: string;
}

export class QRCodeValue {
  qr?: string;
  url?: string;
}

export class RequestCodeRequest {
  phoneNumber!: string;
  method?: string;
}

export class PairingCodeResponse {
  code?: string;
  /** The code without the ABCD-ABCD dash, for clients that strip it. */
  codeRaw?: string;
  /** The phone number the code was issued for. */
  phoneNumber?: string;
}

export enum QRCodeFormat {
  TEXT = 'text',
  IMAGE = 'image',
}

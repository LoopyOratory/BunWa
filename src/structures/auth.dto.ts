export class QRCodeQuery {
  format?: string;
}

export class QRCodeValue {
  qr?: string;
  url?: string;
}

export class RequestCodeRequest {
  phoneNumber: string;
  method?: string;
}

export class PairingCodeResponse {
  code?: string;
}

export enum QRCodeFormat {
  TEXT = 'text',
  IMAGE = 'image',
}

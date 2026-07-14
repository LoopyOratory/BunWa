export const BROADCAST_ID = 'status@broadcast';

export class StatusRequest {
  id?: string;
  contacts?: string[];
}

export class TextStatus extends StatusRequest {
  text!: string;
  backgroundColor?: string;
  font?: string;
  linkPreview?: any;
  linkPreviewHighQuality?: boolean;
}

export class ImageStatus extends StatusRequest {
  file: any;
  caption?: string;
}

export class VoiceStatus extends StatusRequest {
  file: any;
  backgroundColor?: string;
  convert?: boolean;
}

export class VideoStatus extends StatusRequest {
  file: any;
  caption?: string;
  convert?: boolean;
}

export class DeleteStatusRequest {
  id!: string;
  contacts?: string[];
}

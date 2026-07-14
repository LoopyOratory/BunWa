export const BROADCAST_ID = 'status@broadcast';

export class TextStatus {
  text!: string;
  backgroundColor?: string;
  font?: string;
  linkPreview?: any;
  linkPreviewHighQuality?: boolean;
}

export class ImageStatus {
  file: any;
  caption?: string;
}

export class VoiceStatus {
  file: any;
  backgroundColor?: string;
  convert?: boolean;
}

export class VideoStatus {
  file: any;
  caption?: string;
  convert?: boolean;
}

export class DeleteStatusRequest {
  id!: string;
  contacts?: string[];
}

export class StatusRequest {
  id?: string;
  contacts?: string[];
}

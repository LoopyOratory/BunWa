export class WAMedia {
  url?: string;
  mimetype?: string;
  filename?: string;
  s3?: any;
  error?: string;
}

export class FileDTO {
  url?: string;
  data?: string;
}

export class VoiceFileDTO extends FileDTO {}
export class VideoFileDTO extends FileDTO {}

export enum WAMimeType {
  VOICE = 'audio/ogg; codecs=opus',
  VIDEO = 'video/mp4',
  IMAGE = 'image/jpeg',
}

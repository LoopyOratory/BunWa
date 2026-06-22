export class Base64File {
  mimetype: string;
  data: string;
}

export class RemoteFile {
  mimetype: string;
  filename?: string;
  url: string;
}

export class BinaryFile {
  mimetype: string;
  filename?: string;
  data: string;
}

export class VoiceBinaryFile extends BinaryFile {}
export class VoiceRemoteFile extends RemoteFile {}
export class VideoBinaryFile extends BinaryFile {}
export class VideoRemoteFile extends RemoteFile {}

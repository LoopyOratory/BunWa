export interface IMediaConverter {
  voice(content: Buffer): Promise<Buffer>;
  video(content: Buffer): Promise<Buffer>;
}

export class CoreMediaConverter implements IMediaConverter {
  async voice(content: Buffer): Promise<Buffer> {
    throw new Error('Voice conversion not available in Core version');
  }

  async video(content: Buffer): Promise<Buffer> {
    throw new Error('Video conversion not available in Core version');
  }
}

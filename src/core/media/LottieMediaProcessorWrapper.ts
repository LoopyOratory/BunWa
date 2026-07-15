import { IMediaEngineProcessor } from './IMediaEngineProcessor';

// Lottie (animated sticker) decoding isn't implemented yet; this wrapper
// passes every call straight through to the wrapped processor unchanged.
export class LottieMediaProcessorWrapper<Message>
  implements IMediaEngineProcessor<Message>
{
  constructor(
    private readonly inner: IMediaEngineProcessor<Message>,
    private readonly logger?: any,
  ) {}

  hasMedia(message: Message): boolean {
    return this.inner.hasMedia(message);
  }

  getFilename(message: Message): string | null {
    return this.inner.getFilename(message);
  }

  getMimetype(message: Message): string {
    return this.inner.getMimetype(message);
  }

  getMessageId(message: Message): string {
    return this.inner.getMessageId(message);
  }

  getChatId(message: Message): string {
    return this.inner.getChatId(message);
  }

  getMediaBuffer(message: Message): Promise<Buffer | null> {
    return this.inner.getMediaBuffer(message);
  }
}

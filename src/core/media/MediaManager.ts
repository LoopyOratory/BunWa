import { IMediaManager, IMediaEngineProcessor, IMediaStorage, MediaData } from './IMediaManager';
import pino from 'pino';

export class MediaManager implements IMediaManager {
  private storage: IMediaStorage | null;
  private mimetypes: string[];
  private logger: any;

  constructor(storage: IMediaStorage | null, mimetypes: string[], logger?: any) {
    this.storage = storage;
    this.mimetypes = mimetypes;
    this.logger = logger || pino({ name: 'MediaManager' });
  }

  async processMedia<Message>(
    processor: IMediaEngineProcessor<Message>,
    message: Message,
    session: string,
  ): Promise<any | null> {
    if (!processor.hasMedia(message)) {
      return null;
    }

    const filename = processor.getFilename(message);
    const mimetype = processor.getMimetype(message);
    const messageId = processor.getMessageId(message);
    const chatId = processor.getChatId(message);

    // Check mimetype filter
    if (this.mimetypes.length > 0 && !this.mimetypes.includes(mimetype)) {
      this.logger.debug(`Skipping media with mimetype: ${mimetype}`);
      return null;
    }

    try {
      const buffer = await processor.getMediaBuffer(message);
      if (!buffer) {
        return null;
      }

      const extension = filename?.split('.').pop() || 'bin';

      const data: MediaData = {
        session,
        message: {
          id: messageId,
          chatId,
        },
        file: {
          extension,
          mimetype,
          filename: filename || undefined,
        },
      };

      if (this.storage) {
        const saved = await this.storage.save(buffer, data);
        if (!saved) {
          // The backend reported a failure. Returning a URL here would hand
          // the caller a link that 404s; say the media was not stored.
          this.logger.error(
            `Media storage did not persist ${messageId} for session ${session}`,
          );
          return null;
        }
        const storageData = await this.storage.getStorageData(data);
        return {
          url: storageData.url,
          mimetype,
          filename,
          s3: storageData.s3,
        };
      }

      return {
        mimetype,
        filename,
      };
    } catch (error) {
      this.logger.error(`Failed to process media: ${error}`);
      return null;
    }
  }

  close(): void {
    // Release the storage backend (the local store owns one expiry sweeper).
    // It used to be a no-op, so a stopped session kept its sweep timer and an
    // S3 client alive until process exit.
    this.storage?.close().catch((error) =>
      this.logger.warn(`Failed to close media storage: ${error}`),
    );
  }
}

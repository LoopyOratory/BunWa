import { WAMedia } from '../../structures/media.dto';

export interface IMediaManager {
  processMedia<Message>(
    processor: any,
    message: Message,
    session: string,
  ): Promise<WAMedia | null>;
  close(): void;
}

// Media descriptor passed to a storage backend. Shape mirrors what
// MediaManager.processMedia() constructs and what every storage impl reads.
export interface MediaData {
  session: string;
  message: {
    id: string;
    chatId?: string;
  };
  file: {
    extension: string;
    mimetype: string;
    filename?: string;
  };
}

// Result of persisting/looking up media in a storage backend.
export interface MediaStorageData {
  url: string;
  s3?: {
    Bucket: string;
    Key: string;
  };
}

// Contract implemented by MediaLocalStorage, S3MediaStorage, and
// PostgresMediaStorage. `init` is optional — S3 doesn't need it and it is
// never invoked by MediaManager.
export interface IMediaStorage {
  init?(): Promise<void>;
  save(buffer: Buffer, data: MediaData): Promise<boolean>;
  exists(data: MediaData): Promise<boolean>;
  getStorageData(data: MediaData): Promise<MediaStorageData>;
  purge(): Promise<void>;
  close(): Promise<void>;
}

// Re-exported here so consumers can import all media contracts from one place;
// the canonical definition lives in ./IMediaEngineProcessor.
export type { IMediaEngineProcessor } from './IMediaEngineProcessor';

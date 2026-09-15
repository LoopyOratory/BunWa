import { S3Client } from 'bun';
import { MediaData, MediaStorageData } from '../../../core/media/IMediaManager';

export class S3Config {
  bucket!: string;
  region!: string;
  accessKeyId!: string;
  secretAccessKey!: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

/**
 * S3 media storage on Bun's built-in S3 client.
 *
 * Replaces the AWS SDK (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
 * with the runtime's native SigV4 implementation: same operations, no
 * dependencies, and `exists()` is a HEAD request instead of a full GET that
 * downloads the object just to prove it exists.
 */
export class S3MediaStorage {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      bucket: config.bucket,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      // MinIO and most S3-compatible endpoints need path-style addressing
      // (endpoint + forcePathStyle=true); AWS itself prefers virtual-hosted.
      virtualHostedStyle: !config.forcePathStyle,
    });
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    const key = this.buildKey(data);
    await this.client.write(key, buffer, { type: data.file.mimetype });
    return true;
  }

  async exists(data: MediaData): Promise<boolean> {
    return this.client.exists(this.buildKey(data));
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const key = this.buildKey(data);
    return {
      url: this.client.presign(key, { method: 'GET', expiresIn: 3600 }),
      s3: {
        Bucket: this.bucket,
        Key: key,
      },
    };
  }

  async purge(): Promise<void> {
    // S3 lifecycle rules handle purging
  }

  async close(): Promise<void> {
    // No cleanup needed
  }

  private buildKey(data: MediaData): string {
    const ext = data.file.extension || 'bin';
    return `${data.session}/${data.message.id}.${ext}`;
  }
}

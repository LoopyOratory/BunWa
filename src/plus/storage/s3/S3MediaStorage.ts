import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaData, MediaStorageData } from '../../../core/media/IMediaManager';

export class S3Config {
  bucket!: string;
  region!: string;
  accessKeyId!: string;
  secretAccessKey!: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export class S3MediaStorage {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
    });
  }

  async save(buffer: Buffer, data: MediaData): Promise<boolean> {
    const key = this.buildKey(data);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: data.file.mimetype,
    }));
    return true;
  }

  async exists(data: MediaData): Promise<boolean> {
    try {
      const key = this.buildKey(data);
      await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch {
      return false;
    }
  }

  async getStorageData(data: MediaData): Promise<MediaStorageData> {
    const key = this.buildKey(data);
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: 3600 }
    );
    return {
      url,
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

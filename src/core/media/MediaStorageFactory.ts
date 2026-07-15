import { IMediaStorage } from './IMediaManager';
import { MediaLocalStorage } from './MediaLocalStorage';

/**
 * Resolves the same local-storage root MediaLocalStorage defaults to, so
 * the file-serving route (src/api/files.routes.ts) reads from exactly the
 * directory buildMediaStorage() writes to.
 */
export function getLocalMediaFolder(): string {
  return (
    process.env.WAHA_STORAGE_LOCAL_PATH ||
    process.env.WHATSAPP_FILES_FOLDER ||
    '/tmp/whatsapp-files'
  );
}

/**
 * Builds the media storage backend selected via WAHA_STORAGE_TYPE
 * (local | s3). Postgres media storage (src/plus/storage/postgres) isn't
 * wired here — there's no dashboard option to select it and WAHA_DB_TYPE
 * already covers Postgres for session/chat data, so exposing a second,
 * separate Postgres config surface for media specifically isn't done
 * without a concrete need for it.
 */
export async function buildMediaStorage(
  baseUrl: string,
  logger: any,
): Promise<IMediaStorage> {
  const storageType = (process.env.WAHA_STORAGE_TYPE || 'local').toLowerCase();

  if (storageType === 's3') {
    const { S3MediaStorage } = await import('../../plus/storage/s3/S3MediaStorage');
    return new S3MediaStorage({
      bucket: process.env.WAHA_S3_BUCKET || '',
      region: process.env.WAHA_S3_REGION || 'us-east-1',
      accessKeyId: process.env.WAHA_S3_ACCESS_KEY || '',
      secretAccessKey: process.env.WAHA_S3_SECRET_KEY || '',
      endpoint: process.env.WAHA_S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.WAHA_S3_ENDPOINT),
    });
  }

  const storage = new MediaLocalStorage(
    logger,
    getLocalMediaFolder(),
    `${baseUrl}/api/files`,
  );
  await storage.init();
  return storage;
}

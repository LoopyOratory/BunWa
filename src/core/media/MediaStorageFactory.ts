import { IMediaStorage } from './IMediaManager';
import { MediaLocalStorage } from './MediaLocalStorage';

/**
 * Resolves the same local-storage root MediaLocalStorage defaults to, so
 * the file-serving route (src/api/files.routes.ts) reads from exactly the
 * directory buildMediaStorage() writes to.
 */
export function getLocalMediaFolder(): string {
  return (
    process.env.BUNWA_STORAGE_LOCAL_PATH ||
    process.env.WHATSAPP_FILES_FOLDER ||
    '/tmp/whatsapp-files'
  );
}

/**
 * Builds the media storage backend selected via BUNWA_STORAGE_TYPE
 * (local | s3). Postgres media storage (src/plus/storage/postgres) isn't
 * wired here — there's no dashboard option to select it and BUNWA_DB_TYPE
 * already covers Postgres for session/chat data, so exposing a second,
 * separate Postgres config surface for media specifically isn't done
 * without a concrete need for it.
 */
export async function buildMediaStorage(
  baseUrl: string,
  logger: any,
): Promise<IMediaStorage> {
  const storageType = (process.env.BUNWA_STORAGE_TYPE || 'local').toLowerCase();

  if (storageType === 's3') {
    const { S3MediaStorage } = await import('../../plus/storage/s3/S3MediaStorage');
    return new S3MediaStorage({
      bucket: process.env.BUNWA_S3_BUCKET || '',
      region: process.env.BUNWA_S3_REGION || 'us-east-1',
      accessKeyId: process.env.BUNWA_S3_ACCESS_KEY || '',
      secretAccessKey: process.env.BUNWA_S3_SECRET_KEY || '',
      endpoint: process.env.BUNWA_S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.BUNWA_S3_ENDPOINT),
    });
  }

  const storage = new MediaLocalStorage(
    logger,
    getLocalMediaFolder(),
    `${baseUrl}/api/files`,
    mediaLifetimeSeconds(),
  );
  await storage.init();
  return storage;
}

/**
 * How long a locally stored media URL stays valid. Defaults to 180 s; the URL
 * is ephemeral by design, so a dashboard that needs to keep a link around can
 * raise it without patching code.
 */
function mediaLifetimeSeconds(): number {
  const raw = process.env.BUNWA_MEDIA_LIFETIME_SECONDS;
  if (raw === undefined || raw === '') return 180;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 180;
}

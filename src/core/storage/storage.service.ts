import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { isPathWithin, isSafeStorageKey } from '../utils/path-safety';

const logger = pino({ name: 'StorageService' });

/** Per-entry buffer cap for an import (200 MiB — bounds a decompression bomb). */
const DEFAULT_IMPORT_MAX_BYTES = 200 * 1024 * 1024;
/** Max number of entries an import archive may contain. Bounds an entry-count DoS. */
const DEFAULT_IMPORT_MAX_ENTRIES = 100_000;

function positiveIntFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface StorageConfig {
  type?: string;           // 'local' or 's3'
  localPath?: string;      // default: './data/media'
  s3Endpoint?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3Region?: string;
  s3Bucket?: string;
}

/**
 * Unified storage service supporting local filesystem and S3 backends.
 * Ported from OpenWA's storage.service.ts, adapted for Bun runtime.
 *
 * Supports: local file storage, S3 upload/download/list/delete,
 * export/import as tar.gz, path safety validation, configurable via env vars.
 *
 * Configurable via environment variables:
 *   STORAGE_TYPE         — 'local' (default) or 's3'
 *   S3_ENDPOINT          — S3-compatible endpoint (e.g. MinIO)
 *   S3_ACCESS_KEY_ID     — S3 access key (legacy: S3_ACCESS_KEY)
 *   S3_SECRET_ACCESS_KEY — S3 secret key (legacy: S3_SECRET_KEY)
 *   S3_BUCKET            — S3 bucket name (default: 'waha-bun')
 *   S3_REGION            — S3 region (default: 'us-east-1')
 *   STORAGE_LOCAL_PATH   — Local storage path (default: './data/media')
 */
export class StorageService {
  private readonly storageType: string;
  private readonly localPath: string;
  private s3Client: S3Client | null = null;
  private s3Bucket = 'waha-bun';
  private s3Available = false;

  constructor(config?: StorageConfig) {
    this.storageType = config?.type ?? process.env.STORAGE_TYPE ?? 'local';
    this.localPath = config?.localPath ?? process.env.STORAGE_LOCAL_PATH ?? './data/media';

    // Initialize S3 client if storage type is s3
    if (this.storageType === 's3') {
      const endpoint = config?.s3Endpoint ?? process.env.S3_ENDPOINT;
      // Canonical names are S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY
      // Legacy S3_ACCESS_KEY / S3_SECRET_KEY still read as fallback
      const accessKeyId = config?.s3AccessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY;
      const secretAccessKey = config?.s3SecretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_KEY;
      const region = config?.s3Region ?? process.env.S3_REGION ?? 'us-east-1';

      if (endpoint && accessKeyId && secretAccessKey) {
        this.s3Client = new S3Client({
          endpoint,
          region,
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true, // Required for MinIO
        });
        this.s3Bucket = config?.s3Bucket ?? process.env.S3_BUCKET ?? 'waha-bun';
        this.initializeS3Bucket().catch((err) => {
          logger.error({ err: String(err) }, 'Failed to initialize S3 bucket');
        });
      } else {
        logger.warn('S3 storage requested but endpoint/credentials not configured, falling back to local');
      }
    }

    // Ensure local directory exists
    if (!fs.existsSync(this.localPath)) {
      fs.mkdirSync(this.localPath, { recursive: true });
    }
  }

  private async initializeS3Bucket(): Promise<void> {
    if (!this.s3Client) return;
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.s3Bucket }));
      this.s3Available = true;
      logger.info(`S3 bucket '${this.s3Bucket}' is available`);
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'NotFound' || err.name === 'NoSuchBucket') {
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.s3Bucket }));
          this.s3Available = true;
          logger.info(`Created S3 bucket '${this.s3Bucket}'`);
        } catch (createError) {
          logger.error({ err: String(createError) }, 'Failed to create S3 bucket');
        }
      } else {
        logger.error({ err: String(error) }, 'S3 bucket check failed');
      }
    }
  }

  // ============================================================================
  // Current Storage Operations
  // ============================================================================

  getCurrentStorageType(): string {
    return this.storageType;
  }

  isS3Available(): boolean {
    return this.s3Available;
  }

  async listFiles(): Promise<string[]> {
    if (this.storageType === 's3' && this.s3Client && this.s3Available) {
      return this.listS3Files();
    }
    return this.listLocalFiles();
  }

  async getFile(filePath: string): Promise<Buffer> {
    if (!isSafeStorageKey(filePath)) {
      throw new Error(`Refusing to read an unsafe storage key: ${filePath}`);
    }
    if (this.storageType === 's3' && this.s3Client && this.s3Available) {
      return this.getS3File(filePath);
    }
    return this.getLocalFile(filePath);
  }

  async putFile(filePath: string, data: Buffer): Promise<void> {
    if (!isSafeStorageKey(filePath)) {
      throw new Error(`Refusing to store an unsafe storage key: ${filePath}`);
    }
    if (this.storageType === 's3' && this.s3Client && this.s3Available) {
      return this.putS3File(filePath, data);
    }
    return this.putLocalFile(filePath, data);
  }

  async deleteFile(filePath: string): Promise<void> {
    if (!isSafeStorageKey(filePath)) {
      throw new Error(`Refusing to delete an unsafe storage key: ${filePath}`);
    }
    if (this.storageType === 's3' && this.s3Client && this.s3Available) {
      return this.deleteS3File(filePath);
    }
    return this.deleteLocalFile(filePath);
  }

  async getFileCount(): Promise<{ count: number; sizeBytes: number }> {
    if (this.storageType === 's3' && this.s3Client && this.s3Available) {
      return this.getS3CountAndSize();
    }

    const files = await this.listFiles();
    let sizeBytes = 0;
    for (const file of files) {
      try {
        const fullPath = path.join(this.localPath, file);
        const stats = fs.statSync(fullPath);
        sizeBytes += stats.size;
      } catch (error) {
        logger.debug({ file, error: String(error) }, 'Failed to stat file');
      }
    }

    return { count: files.length, sizeBytes };
  }

  // ============================================================================
  // Export - Create tar.gz buffer from current storage
  // ============================================================================

  async createExportBuffer(): Promise<Buffer> {
    const files = await this.listFiles();
    const entries: Array<{ name: string; data: Buffer }> = [];

    for (const file of files) {
      try {
        const data = await this.getFile(file);
        entries.push({ name: file, data });
      } catch (error) {
        logger.warn({ file, error: String(error) }, 'Failed to export file');
      }
    }

    return createTarGz(entries);
  }

  // ============================================================================
  // Import - Extract tar.gz buffer to current storage
  // ============================================================================

  async importFromBuffer(buffer: Buffer): Promise<number> {
    const maxEntryBytes = positiveIntFromEnv('STORAGE_IMPORT_MAX_BYTES', DEFAULT_IMPORT_MAX_BYTES);
    const maxEntries = positiveIntFromEnv('STORAGE_IMPORT_MAX_ENTRIES', DEFAULT_IMPORT_MAX_ENTRIES);
    return extractTarGz(buffer, async (name, data) => {
      if (!isSafeStorageKey(name)) {
        logger.warn({ name }, 'Skipping unsafe storage key during import');
        return;
      }
      if (data.length > maxEntryBytes) {
        throw new Error(`Import aborted: entry "${name}" exceeds the ${maxEntryBytes}-byte per-entry cap`);
      }
      await this.putFile(name, data);
    }, maxEntries);
  }

  // ============================================================================
  // Local Storage Operations
  // ============================================================================

  private listLocalFiles(dir = ''): string[] {
    const fullPath = path.join(this.localPath, dir);
    const files: string[] = [];

    if (!fs.existsSync(fullPath)) {
      return files;
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = dir ? path.join(dir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        files.push(...this.listLocalFiles(relativePath));
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }

    return files;
  }

  private getLocalFile(filePath: string): Promise<Buffer> {
    if (!isPathWithin(this.localPath, filePath)) {
      throw new Error(`Refusing to read outside storage root: ${filePath}`);
    }
    const fullPath = path.join(this.localPath, filePath);
    return fs.promises.readFile(fullPath);
  }

  private async putLocalFile(filePath: string, data: Buffer): Promise<void> {
    if (!isPathWithin(this.localPath, filePath)) {
      throw new Error(`Refusing to write outside storage root: ${filePath}`);
    }
    const fullPath = path.join(this.localPath, filePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, data);
  }

  private async deleteLocalFile(filePath: string): Promise<void> {
    if (!isPathWithin(this.localPath, filePath)) {
      throw new Error(`Refusing to delete outside storage root: ${filePath}`);
    }
    const fullPath = path.join(this.localPath, filePath);
    await fs.promises.unlink(fullPath);
  }

  // ============================================================================
  // S3 Storage Operations
  // ============================================================================

  private async listS3Files(): Promise<string[]> {
    if (!this.s3Client) return [];

    const files: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.s3Bucket,
          Prefix: 'media/',
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            // Remove 'media/' prefix
            files.push(obj.Key.replace(/^media\//, ''));
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return files;
  }

  private async getS3File(filePath: string): Promise<Buffer> {
    if (!this.s3Client) throw new Error('S3 client not initialized');

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.s3Bucket,
        Key: `media/${filePath}`,
      }),
    );

    if (!response.Body) throw new Error('Empty response body');

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const stream = response.Body as AsyncIterable<Uint8Array>;

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  private async putS3File(filePath: string, data: Buffer): Promise<void> {
    if (!this.s3Client) throw new Error('S3 client not initialized');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: `media/${filePath}`,
        Body: data,
      }),
    );
  }

  private async deleteS3File(filePath: string): Promise<void> {
    if (!this.s3Client) throw new Error('S3 client not initialized');

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.s3Bucket,
        Key: `media/${filePath}`,
      }),
    );
  }

  private async getS3CountAndSize(): Promise<{ count: number; sizeBytes: number }> {
    let count = 0;
    let sizeBytes = 0;
    let continuationToken: string | undefined;

    do {
      const response = await this.s3Client!.send(
        new ListObjectsV2Command({
          Bucket: this.s3Bucket,
          Prefix: 'media/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        count += 1;
        sizeBytes += obj.Size ?? 0;
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return { count, sizeBytes };
  }
}

// ============================================================================
// Tar.gz helpers (pure implementation — no archiver dependency needed)
// ============================================================================

import { createGzip, createGunzip } from 'zlib';

interface TarEntry {
  name: string;
  data: Buffer;
}

/**
 * Minimal tar.gz writer — produces a valid POSIX.1-2001 tar archive, gzipped.
 * Sufficient for export/import; does not handle exotic tar features.
 */
async function createTarGz(entries: TarEntry[]): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    chunks.push(createTarHeader(entry.name, entry.data.length));
    chunks.push(entry.data);
    // Pad to 512-byte block boundary
    const remainder = entry.data.length % 512;
    if (remainder !== 0) {
      chunks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End-of-archive: two 512-byte zero blocks
  chunks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(chunks);

  return new Promise((resolve, reject) => {
    const gzip = createGzip({ level: 6 });
    const bufs: Buffer[] = [];
    gzip.on('data', (chunk) => bufs.push(chunk));
    gzip.on('end', () => resolve(Buffer.concat(bufs)));
    gzip.on('error', reject);
    gzip.end(tarBuffer);
  });
}

function createTarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512);

  // File name (offset 0, 100 bytes)
  const nameBytes = Buffer.from(name, 'utf8');
  nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

  // File mode (offset 100, 8 bytes) — 0644
  header.write('0000644\0', 100, 'ascii');

  // Owner ID (offset 108, 8 bytes)
  header.write('0000000\0', 108, 'ascii');

  // Group ID (offset 116, 8 bytes)
  header.write('0000000\0', 116, 'ascii');

  // File size in octal (offset 124, 12 bytes)
  const sizeStr = size.toString(8).padStart(11, '0') + '\0';
  header.write(sizeStr, 124, 'ascii');

  // Modification time (offset 136, 12 bytes) — seconds since epoch
  const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
  header.write(mtime, 136, 'ascii');

  // Checksum placeholder (offset 148, 8 bytes) — fill with spaces first
  header.write('        ', 148, 'ascii');

  // Type flag (offset 156, 1 byte) — '0' = regular file
  header.write('0', 156, 'ascii');

  // Compute checksum
  let checksum = 0;
  for (let i = 0; i < 512; i++) {
    checksum += header[i];
  }
  const chkStr = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.write(chkStr, 148, 'ascii');

  return header;
}

/**
 * Minimal tar.gz reader — extracts files from a gzipped tar archive.
 */
async function extractTarGz(
  buffer: Buffer,
  onEntry: (name: string, data: Buffer) => Promise<void>,
  maxEntries: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let importedCount = 0;
    let entryCount = 0;

    const fail = (err: Error): void => {
      if (settled) return;
      settled = true;
      gunzip.destroy();
      reject(err);
    };

    const gunzip = createGunzip();
    const chunks: Buffer[] = [];

    gunzip.on('data', (chunk: Buffer) => {
      if (settled) return;
      chunks.push(chunk);
    });

    gunzip.on('end', () => {
      if (settled) return;
      settled = true;

      try {
        const tarBuffer = Buffer.concat(chunks);
        const result = parseTarEntries(tarBuffer);
        const entries = result.slice(0, maxEntries);

        if (result.length > maxEntries) {
          fail(new Error(`Import aborted: archive exceeds the ${maxEntries}-entry limit`));
          return;
        }

        (async () => {
          for (const entry of entries) {
            await onEntry(entry.name, entry.data);
            importedCount++;
          }
          resolve(importedCount);
        })().catch(fail);
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    });

    gunzip.on('error', (err: Error) => {
      fail(err);
    });

    gunzip.end(buffer);
  });
}

function parseTarEntries(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);

    // Check for end-of-archive (all zeros)
    if (header.every((b) => b === 0)) break;

    // File name (offset 0, 100 bytes)
    const nameEnd = header.indexOf(0, 0, 'ascii');
    const name = header.subarray(0, nameEnd === -1 ? 100 : nameEnd).toString('utf8');

    // File size in octal (offset 124, 12 bytes)
    const sizeStr = header.subarray(124, 136).toString('ascii').trim().replace(/\0/g, '');
    const size = parseInt(sizeStr, 8) || 0;

    // Type flag (offset 156)
    const typeFlag = String.fromCharCode(header[156]);

    offset += 512; // Past header

    if (typeFlag === '0' || typeFlag === '\0') {
      // Regular file
      const data = buffer.subarray(offset, offset + size);
      entries.push({ name, data: Buffer.from(data) });
    }

    // Advance past data blocks (padded to 512 bytes)
    const dataBlocks = Math.ceil(size / 512);
    offset += dataBlocks * 512;
  }

  return entries;
}

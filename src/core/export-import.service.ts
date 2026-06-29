/**
 * Data Export/Import Service.
 * Export all sessions, webhooks, templates, and media as tar.gz.
 * Import from tar.gz with validation and backup rotation.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { createGzip, createGunzip } from 'zlib';
import pino from 'pino';

const log = pino({ name: 'ExportImportService' });
const DATA_DIR = process.env.DATA_DIR || './data';

export interface ImportOptions {
  overwriteExisting?: boolean;
}

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: Date;
}

export class ExportImportService {
  private exportDir: string;
  private backupDir: string;
  private maxBackups: number;

  constructor() {
    this.exportDir = join(DATA_DIR, 'exports');
    this.backupDir = join(DATA_DIR, 'backups');
    if (!existsSync(this.exportDir)) mkdirSync(this.exportDir, { recursive: true });
    if (!existsSync(this.backupDir)) mkdirSync(this.backupDir, { recursive: true });

    const parsed = Number.parseInt(process.env.EXPORT_IMPORT_MAX_BACKUPS ?? '', 10);
    this.maxBackups = Number.isInteger(parsed) && parsed >= 0 ? parsed : 5;
  }

  /**
   * Export all data as a tar.gz buffer.
   * Includes metadata JSON + media files.
   */
  async exportAll(): Promise<Buffer> {
    log.info('Starting full export...');

    const data: Record<string, any> = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
    };

    // Collect JSON data from subdirectories
    for (const dirName of ['sessions', 'templates', 'webhooks']) {
      const dir = join(DATA_DIR, dirName);
      if (existsSync(dir)) {
        data[dirName] = {};
        for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
          data[dirName][file.replace('.json', '')] = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        }
      }
    }

    // Collect media files
    const mediaFiles: Array<{ name: string; data: Buffer }> = [];
    const mediaDir = join(DATA_DIR, 'media');
    if (existsSync(mediaDir)) {
      this.collectMediaFiles(mediaDir, 'media', mediaFiles);
    }

    // Build tar.gz
    const jsonPayload = JSON.stringify(data, null, 2);
    const entries: Array<{ name: string; data: Buffer }> = [
      { name: 'metadata.json', data: Buffer.from(jsonPayload) },
      ...mediaFiles,
    ];

    const tarBuffer = await this.createTarGz(entries);
    log.info({ bytes: tarBuffer.length, mediaFiles: mediaFiles.length }, 'Export completed');
    return tarBuffer;
  }

  /**
   * Export and save to a backup file.
   */
  async createBackup(): Promise<{ filename: string; size: number }> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `waha-backup-${ts}.tar.gz`;
    const backupPath = join(this.backupDir, filename);

    const data = await this.exportAll();
    await Bun.write(backupPath, data);
    log.info({ filename, size: data.length }, 'Backup created');

    if (this.maxBackups > 0) {
      await this.rotateBackups();
    }

    return { filename, size: data.length };
  }

  /**
   * Import from a tar.gz buffer.
   */
  async importAll(buffer: Buffer, options: ImportOptions = {}): Promise<{ imported: number; errors: string[] }> {
    log.info('Starting import...');

    const entries = await this.extractTarGz(buffer);
    const errors: string[] = [];
    let imported = 0;

    const metadataEntry = entries.find(e => e.name === 'metadata.json');
    if (!metadataEntry) {
      throw new Error('Invalid archive: metadata.json not found');
    }

    const data = JSON.parse(metadataEntry.data.toString('utf8'));
    if (data.version !== '1.0.0') {
      log.warn({ version: data.version }, 'Import archive has non-standard version');
    }

    // Import JSON directories
    for (const dirName of ['sessions', 'templates', 'webhooks']) {
      if (data[dirName] && typeof data[dirName] === 'object') {
        const dir = join(DATA_DIR, dirName);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        for (const [key, value] of Object.entries(data[dirName] as Record<string, any>)) {
          try {
            const filePath = join(dir, `${key}.json`);
            if (!options.overwriteExisting && existsSync(filePath)) {
              continue;
            }
            await Bun.write(filePath, JSON.stringify(value, null, 2));
            imported++;
          } catch (err: any) {
            errors.push(`${dirName}/${key}: ${err.message}`);
          }
        }
      }
    }

    // Import media files
    const mediaFiles = entries.filter(e => e.name !== 'metadata.json');
    for (const file of mediaFiles) {
      try {
        const filePath = join(DATA_DIR, file.name);
        await mkdirSync(dirname(filePath), { recursive: true });
        await Bun.write(filePath, file.data);
        imported++;
      } catch (err: any) {
        errors.push(`media/${file.name}: ${err.message}`);
      }
    }

    log.info({ imported, errors: errors.length }, 'Import completed');
    return { imported, errors };
  }

  /**
   * List available backups.
   */
  async listBackups(): Promise<BackupInfo[]> {
    if (!existsSync(this.backupDir)) return [];

    const files = readdirSync(this.backupDir);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.tar.gz')) continue;
      const filePath = join(this.backupDir, file);
      const stat = statSync(filePath);
      backups.push({ filename: file, size: stat.size, createdAt: stat.birthtime });
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Delete a specific backup.
   */
  async deleteBackup(filename: string): Promise<void> {
    const resolvedDir = resolve(this.backupDir);
    const resolvedPath = resolve(join(this.backupDir, filename));
    if (!resolvedPath.startsWith(resolvedDir + '/')) {
      throw new Error('Invalid backup filename');
    }
    const { unlinkSync } = require('fs');
    unlinkSync(resolvedPath);
    log.info({ filename }, 'Backup deleted');
  }

  // ============================================================================
  // Legacy JSON export/import (backward compatible)
  // ============================================================================

  async exportData(): Promise<{ path: string; size: number }> {
    const data: Record<string, any> = {};

    for (const dirName of ['sessions', 'templates', 'webhooks']) {
      const dir = join(DATA_DIR, dirName);
      if (existsSync(dir)) {
        data[dirName] = {};
        for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
          data[dirName][file.replace('.json', '')] = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        }
      }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const exportPath = join(this.exportDir, `waha-export-${ts}.json`);
    const json = JSON.stringify(data, null, 2);
    await Bun.write(exportPath, json);
    log.info(`Exported to ${exportPath} (${json.length} bytes)`);
    return { path: exportPath, size: json.length };
  }

  async importData(filePath: string): Promise<{ imported: number; errors: string[] }> {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const data = JSON.parse(await Bun.file(filePath).text());
    const errors: string[] = [];
    let imported = 0;

    for (const [dirName, items] of Object.entries(data)) {
      if (typeof items !== 'object' || items === null) continue;
      const dir = join(DATA_DIR, dirName);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      for (const [key, value] of Object.entries(items as Record<string, any>)) {
        try {
          Bun.write(join(dir, `${key}.json`), JSON.stringify(value, null, 2));
          imported++;
        } catch (err: any) {
          errors.push(`${key}: ${err.message}`);
        }
      }
    }

    log.info(`Imported ${imported} items`);
    return { imported, errors };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private collectMediaFiles(dir: string, relativePath: string, results: Array<{ name: string; data: Buffer }>): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        this.collectMediaFiles(join(dir, entry.name), relPath, results);
      } else if (entry.isFile()) {
        try {
          const data = readFileSync(join(dir, entry.name));
          results.push({ name: relPath, data: Buffer.from(data) });
        } catch { /* skip */ }
      }
    }
  }

  private async rotateBackups(): Promise<void> {
    try {
      const files = readdirSync(this.backupDir).filter(f => f.endsWith('.tar.gz')).sort().reverse();
      if (files.length > this.maxBackups) {
        for (const file of files.slice(this.maxBackups)) {
          const { unlinkSync } = require('fs');
          unlinkSync(join(this.backupDir, file));
          log.info({ filename: file }, 'Rotated old backup');
        }
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to rotate backups');
    }
  }

  // ============================================================================
  // Tar.gz helpers
  // ============================================================================

  private async createTarGz(entries: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for (const entry of entries) {
      chunks.push(this.createTarHeader(entry.name, entry.data.length));
      chunks.push(entry.data);
      const remainder = entry.data.length % 512;
      if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder));
    }
    chunks.push(Buffer.alloc(1024)); // end-of-archive
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

  private createTarHeader(name: string, size: number): Buffer {
    const header = Buffer.alloc(512);
    const nameBytes = Buffer.from(name, 'utf8');
    nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));
    header.write('0000644\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 'ascii');
    header.write('        ', 148, 'ascii');
    header.write('0', 156, 'ascii');
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    return header;
  }

  private async extractTarGz(buffer: Buffer): Promise<Array<{ name: string; data: Buffer }>> {
    return new Promise((resolve, reject) => {
      const gunzip = createGunzip();
      const chunks: Buffer[] = [];
      gunzip.on('data', (chunk: Buffer) => chunks.push(chunk));
      gunzip.on('end', () => {
        try { resolve(this.parseTarEntries(Buffer.concat(chunks))); }
        catch (err) { reject(err); }
      });
      gunzip.on('error', reject);
      gunzip.end(buffer);
    });
  }

  private parseTarEntries(buffer: Buffer): Array<{ name: string; data: Buffer }> {
    const entries: Array<{ name: string; data: Buffer }> = [];
    let offset = 0;
    while (offset + 512 <= buffer.length) {
      const header = buffer.subarray(offset, offset + 512);
      if (header.every((b) => b === 0)) break;
      const nameEnd = header.indexOf(0, 0, 'ascii');
      const name = header.subarray(0, nameEnd === -1 ? 100 : nameEnd).toString('utf8');
      const sizeStr = header.subarray(124, 136).toString('ascii').trim().replace(/\0/g, '');
      const size = parseInt(sizeStr, 8) || 0;
      const typeFlag = String.fromCharCode(header[156]);
      offset += 512;
      if (typeFlag === '0' || typeFlag === '\0') {
        entries.push({ name, data: Buffer.from(buffer.subarray(offset, offset + size)) });
      }
      offset += Math.ceil(size / 512) * 512;
    }
    return entries;
  }
}

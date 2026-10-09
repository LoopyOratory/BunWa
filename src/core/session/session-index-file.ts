import { copyFile, mkdir, rename, unlink } from 'fs/promises';
import { dirname } from 'path';
import pino from 'pino';

const logger = pino({ name: 'SessionIndexFile' });

type Index = Record<string, any>;

/**
 * The sessions index (`.sessions-index.json`) holds every session's config,
 * webhooks and API keys, so losing it loses all of them.
 *
 * Writes are atomic (temp file + rename) and serialized, so a crash or two
 * overlapping writes can never leave a half-written file. The previous good
 * file is kept as `.bak`. Reads never silently fall back to an empty index: a
 * file that does not parse is moved aside as `.corrupt-<timestamp>` and the
 * backup is tried, with an error logged either way.
 */
export class SessionIndexFile {
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly path: string) {}

  get backupPath(): string {
    return `${this.path}.bak`;
  }

  /**
   * Queue a write. `snapshot` is called when the write runs, not when it is
   * queued, so the newest state always lands last.
   */
  write(snapshot: () => Index): Promise<void> {
    const run = this.queue.then(() => this.writeNow(snapshot()));
    // Keep the chain alive after a failed write; the caller still sees the error.
    this.queue = run.catch(() => {});
    return run;
  }

  private async writeNow(index: Index): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    try {
      await Bun.write(tmp, JSON.stringify(index, null, 2));
      if (await Bun.file(this.path).exists()) {
        await copyFile(this.path, this.backupPath);
      }
      await rename(tmp, this.path);
    } catch (error) {
      await unlink(tmp).catch(() => {});
      throw error;
    }
  }

  async read(): Promise<Index> {
    const primary = await this.parse(this.path);
    if (primary.ok) {
      return primary.index;
    }
    if (primary.state === 'corrupt') {
      const aside = `${this.path}.corrupt-${Date.now()}`;
      await rename(this.path, aside).catch(() => {});
      logger.error(
        `Sessions index ${this.path} could not be parsed and was moved to ${aside}`,
      );
    }

    const backup = await this.parse(this.backupPath);
    if (backup.ok) {
      if (primary.state === 'corrupt') {
        logger.warn(`Sessions index restored from backup ${this.backupPath}`);
      }
      return backup.index;
    }
    if (primary.state === 'corrupt') {
      logger.error(
        'No usable sessions index backup: starting with no sessions. ' +
          'Recover session configs from the .corrupt file before saving any session.',
      );
    }
    return {};
  }

  private async parse(
    path: string,
  ): Promise<{ ok: true; index: Index } | { ok: false; state: 'missing' | 'corrupt' }> {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return { ok: false, state: 'missing' };
    }
    try {
      const value = JSON.parse(await file.text());
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { ok: true, index: value };
      }
    } catch {
      // fall through
    }
    return { ok: false, state: 'corrupt' };
  }
}

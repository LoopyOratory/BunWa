import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtempSync, readdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SessionIndexFile } from '../core/session/session-index-file';

// The sessions index holds every session's config, webhooks and API keys.
// These tests pin the guarantees that keep it from being lost: atomic,
// ordered writes, a backup of the previous good file, and no silent fallback
// to an empty index when the file is damaged.
describe('SessionIndexFile', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bunwa-index-'));
    path = join(dir, 'noweb', '.sessions-index.json');
  });

  it('returns an empty index when no file exists', async () => {
    expect(await new SessionIndexFile(path).read()).toEqual({});
  });

  it('round-trips a written index and creates the directory', async () => {
    const file = new SessionIndexFile(path);
    await file.write(() => ({ alpha: { engine: 'NOWEB' } }));
    expect(await file.read()).toEqual({ alpha: { engine: 'NOWEB' } });
  });

  it('leaves no temp files behind', async () => {
    const file = new SessionIndexFile(path);
    await file.write(() => ({ a: {} }));
    await file.write(() => ({ b: {} }));
    const leftovers = readdirSync(join(dir, 'noweb')).filter((name) => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('applies overlapping writes in order, so the newest state lands last', async () => {
    const file = new SessionIndexFile(path);
    let state: Record<string, any> = {};
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 25; i++) {
      state = { ...state, [`s${i}`]: { n: i, padding: 'x'.repeat(25 - i) } };
      writes.push(file.write(() => state));
    }
    await Promise.all(writes);
    const index = await file.read();
    expect(Object.keys(index)).toHaveLength(25);
    expect(index.s24.n).toBe(24);
  });

  it('keeps the previous good file as a backup', async () => {
    const file = new SessionIndexFile(path);
    await file.write(() => ({ first: {} }));
    await file.write(() => ({ second: {} }));
    expect(JSON.parse(readFileSync(file.backupPath, 'utf8'))).toEqual({ first: {} });
  });

  it('moves a corrupt file aside and restores from the backup', async () => {
    const file = new SessionIndexFile(path);
    await file.write(() => ({ keep: { webhooks: [] } }));
    await file.write(() => ({ keep: { webhooks: [] }, newer: {} }));
    writeFileSync(path, '{"keep": {"webh');

    const index = await file.read();

    expect(index).toEqual({ keep: { webhooks: [] } });
    expect(existsSync(path)).toBe(false);
    const aside = readdirSync(join(dir, 'noweb')).filter((name) => name.includes('.corrupt-'));
    expect(aside).toHaveLength(1);
  });

  it('treats valid JSON that is not an object as corrupt', async () => {
    const file = new SessionIndexFile(path);
    await file.write(() => ({ keep: {} }));
    await file.write(() => ({ keep: {} }));
    writeFileSync(path, 'null');
    expect(await file.read()).toEqual({ keep: {} });
  });

  it('keeps the corrupt file for recovery when there is no backup', async () => {
    const file = new SessionIndexFile(path);
    await file.write(() => ({ only: {} }));
    writeFileSync(path, 'not json');

    expect(await file.read()).toEqual({});
    const aside = readdirSync(join(dir, 'noweb')).filter((name) => name.includes('.corrupt-'));
    expect(aside).toHaveLength(1);
    expect(readFileSync(join(dir, 'noweb', aside[0]), 'utf8')).toBe('not json');
  });

  it('a failed write does not block later writes', async () => {
    const file = new SessionIndexFile(path);
    await expect(file.write(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    await file.write(() => ({ after: {} }));
    expect(await file.read()).toEqual({ after: {} });
  });
});

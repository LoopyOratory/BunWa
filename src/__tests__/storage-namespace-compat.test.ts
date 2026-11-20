import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEngineStorageDir } from '../core/storage/storage-namespace';

const dirs: string[] = [];
function freshBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'bunwa-storage-ns-'));
  dirs.push(base);
  return base;
}

describe('engine storage namespace compat (NOWEB -> BUNWEB)', () => {
  test('a fresh install uses the canonical bunweb directory', () => {
    const base = freshBase();
    expect(resolveEngineStorageDir(base)).toBe(join(base, 'bunweb'));
  });

  test('an existing deployment keeps its legacy noweb directory', () => {
    const base = freshBase();
    mkdirSync(join(base, 'noweb'), { recursive: true });
    writeFileSync(join(base, 'noweb', '.sessions-index.json'), '{}');
    expect(resolveEngineStorageDir(base)).toBe(join(base, 'noweb'));
  });

  test('an explicit migration (both directories) wins for the canonical name', () => {
    const base = freshBase();
    mkdirSync(join(base, 'noweb'), { recursive: true });
    mkdirSync(join(base, 'bunweb'), { recursive: true });
    expect(resolveEngineStorageDir(base)).toBe(join(base, 'bunweb'));
  });
});

// Cleanup after all tests in this file.
import { afterAll } from 'bun:test';
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

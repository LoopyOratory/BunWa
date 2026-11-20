/**
 * Bun-optimized multi-file auth state.
 * 
 * Key improvements over stock Baileys implementation:
 * - Uses Bun.file().text() instead of fs/promises readFile (~2x faster)
 * - Batch preloads all auth files at startup (avoids lazy-load I/O storms)
 * - No AsyncLock for reads (only writes need locking)
 * - Keeps loaded keys in a memory Map (not a pass-through cache)
 */

import type {
  AuthenticationState,
  AuthenticationCreds,
} from '@whiskeysockets/baileys';
import {
  proto,
  BufferJSON,
  initAuthCreds,
} from '@whiskeysockets/baileys';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import AsyncLock from 'async-lock';

const writeLock = new AsyncLock({
  timeout: 5_000,
  maxPending: Infinity,
  maxExecutionTime: 30_000,
});

const fixFileName = (file?: string) =>
  file?.replace(/\//g, '__')?.replace(/:/g, '-') || '';

export const useMultiFileAuthState = async (
  folder: string,
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  close: () => Promise<void>;
}> => {
  const writeData = (data: any, file: string) => {
    const filePath = join(folder, fixFileName(file));
    return writeLock.acquire(filePath, async () => {
      const json = JSON.stringify(data, BufferJSON.replacer);
      await Bun.write(filePath, json);
    }) as Promise<void>;
  };

  const readCreds = async (): Promise<AuthenticationCreds | null> => {
    try {
      const content = await Bun.file(credsFilePath).text();
      return JSON.parse(content, BufferJSON.reviver);
    } catch { return null; }
  };

  const credsFilePath = join(folder, 'creds.json');

  const creds: AuthenticationCreds =
    (await readCreds()) || initAuthCreds();

  // Pre-load all key files into memory at startup
  // This avoids N+1 lazy loads when Baileys requests keys during handshake
  const keyCache = new Map<string, any>();
  const dir = Bun.spawnSync(['ls', folder]).stdout?.toString().trim();
  if (dir) {
    const files = dir.split('\n');
    const keyFiles = files.filter((f) => f !== 'creds.json' && f.endsWith('.json'));
    await Promise.all(
      keyFiles.map(async (file) => {
        try {
          const path = join(folder, file);
          const content = await Bun.file(path).text();
          const key = file.endsWith('.json') ? file.slice(0, -5) : file;
          keyCache.set(key, JSON.parse(content, BufferJSON.reviver));
        } catch { /* skip corrupt files */ }
      }),
    );
  }

  const keys = {
    get: async (type: string, ids: string[]) => {
      const data: Record<string, any> = {};
      for (const id of ids) {
        const cacheKey = `${type}-${id}`;
        let value = keyCache.get(cacheKey);
        // Fallback: try reading from disk (for keys created after preload)
        if (value === undefined) {
          try {
            const filePath = join(folder, fixFileName(cacheKey));
            const content = await Bun.file(filePath).text();
            value = JSON.parse(content, BufferJSON.reviver);
            keyCache.set(cacheKey, value);
          } catch { /* not found */ }
        }
        if (type === 'app-state-sync-key' && value) {
          value = proto.Message.AppStateSyncKeyData.create(value);
        }
        data[id] = value ?? null;
      }
      return data;
    },
    set: async (data: Record<string, Record<string, any>>) => {
      const tasks: Promise<void>[] = [];
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const cacheKey = `${category}-${id}`;
          if (value) {
            keyCache.set(cacheKey, value);
            tasks.push(writeData(value, cacheKey));
          } else {
            keyCache.delete(cacheKey);
            const filePath = join(folder, fixFileName(cacheKey));
            tasks.push(
              (async () => { await Bun.write(filePath, '').catch(() => {}); })(),
            );
          }
        }
      }
      await Promise.all(tasks);
    },
  };

  return {
    state: {
      creds,
      keys,
    },
    saveCreds: () => writeData(creds, 'creds.json'),
    close: async () => {},
  };
};

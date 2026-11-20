import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Storage-layout compat for the NOWEB -> BUNWEB engine rename.
 *
 * The engine's on-disk directory was `.sessions/noweb/` before the rename:
 * it holds the session index, per-session auth state and the engine's
 * sqlite store. Renaming the engine must not orphan that data, so existing
 * deployments keep using the legacy directory — the canonical `bunweb` name
 * is used only where no legacy directory exists (fresh installs), or once an
 * operator explicitly moves the data over.
 *
 * env vars keep their WAHA_* fallback through src/common/env-alias.ts; this
 * is the same policy for storage paths.
 */
export function resolveEngineStorageDir(baseDir: string): string {
  const canonical = join(baseDir, 'bunweb');
  const legacy = join(baseDir, 'noweb');
  return existsSync(legacy) && !existsSync(canonical) ? legacy : canonical;
}

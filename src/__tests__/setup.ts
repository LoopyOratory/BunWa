// Bun test preload (see bunfig.toml [test] preload). Runs before any test
// file's imports resolve, so env vars set here take effect on module-level
// consts computed from them (e.g. manager.core.ts's getSessionsDir()).
//
// Points session storage at an isolated temp directory instead of this
// project's real .sessions/ — without this, any test that resolves
// SessionManager directly (bypassing restoreSessions(), so its in-memory
// state starts empty) will overwrite the real .sessions-index.json with its
// own incomplete state on the first upsert()/delete(), silently wiping the
// config of any real, already-paired session sharing this machine.
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

if (!process.env.WAHA_LOCAL_STORE_BASE_DIR) {
  process.env.WAHA_LOCAL_STORE_BASE_DIR = mkdtempSync(join(tmpdir(), 'bunwa-test-sessions-'));
}

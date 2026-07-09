import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configureContainer } from '../di/container';
import { createInfraRouter } from '../api/infra.routes';

/**
 * Regression: PUT /api/infra/config used to be a stub that persisted nothing
 * while reporting success. It now writes the config to .env (in the process
 * cwd) and mirrors it into process.env so a subsequent GET reflects it.
 */
describe('Infra config — PUT persists to .env', () => {
  let app: Hono;
  let workdir: string;
  let originalCwd: string;
  const KEY = 'test-infra-key';

  beforeAll(() => {
    configureContainer();
    // Run in an isolated temp dir so the route writes to a throwaway .env.
    originalCwd = process.cwd();
    workdir = mkdtempSync(join(tmpdir(), 'bunwa-infra-'));
    writeFileSync(join(workdir, '.env'), 'EXISTING_KEY=keepme\n', 'utf8');
    process.chdir(workdir);
    process.env.WAHA_API_KEY = KEY;

    app = new Hono();
    app.route('/', createInfraRouter());
  });

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(workdir, { recursive: true, force: true });
    delete process.env.WAHA_API_KEY;
  });

  async function put(body: object) {
    return app.request('/infra/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
      body: JSON.stringify(body),
    });
  }

  it('writes changed keys to .env, preserves unrelated lines, and updates process.env', async () => {
    const res = await put({
      engine: 'WEBJS',
      database: { type: 'postgres', host: 'db.local', port: '5432', username: 'u', name: 'n', ssl: true },
      storage: { type: 's3', localPath: './m', s3: { endpoint: 'e', bucket: 'b', region: 'r', accessKeyId: 'ak', secretAccessKey: 'sk' } },
    });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.result).toBe(true);

    const env = readFileSync(join(workdir, '.env'), 'utf8');
    expect(env).toContain('EXISTING_KEY=keepme');       // untouched
    expect(env).toContain('WHATSAPP_DEFAULT_ENGINE=WEBJS');
    expect(env).toContain('WAHA_DB_TYPE=postgres');
    expect(env).toContain('WAHA_STORAGE_TYPE=s3');

    // Mirrored into process.env for immediate GET reflection.
    expect(process.env.WHATSAPP_DEFAULT_ENGINE).toBe('WEBJS');
    expect(process.env.WAHA_DB_TYPE).toBe('postgres');
  });

  it('GET returns the just-saved values with normalised casing', async () => {
    const res = await app.request('/infra/config', {
      method: 'GET',
      headers: { 'x-api-key': KEY },
    });
    expect(res.status).toBe(200);
    const cfg = await res.json() as any;
    expect(cfg.engine).toBe('WEBJS');          // uppercased
    expect(cfg.database.type).toBe('postgres'); // lowercased
    expect(cfg.storage.type).toBe('s3');        // lowercased
  });
});

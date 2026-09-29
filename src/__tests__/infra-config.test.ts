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
    // The mirrored config keys are real runtime inputs now (WAHA_DB_TYPE is
    // honoured as a driver fallback) — clear them so other suites see a clean
    // environment.
    for (const key of [
      'WHATSAPP_DEFAULT_ENGINE',
      'WAHA_DB_TYPE',
      'WAHA_DB_HOST',
      'WAHA_DB_PORT',
      'WAHA_DB_USERNAME',
      'WAHA_DB_PASSWORD',
      'WAHA_DB_NAME',
      'WAHA_DB_SSL',
      'WAHA_DATABASE_DRIVER',
      'WAHA_DATABASE_URL',
      'WAHA_STORAGE_TYPE',
      'WAHA_S3_ENDPOINT',
      'WAHA_S3_BUCKET',
      'WAHA_S3_REGION',
      'WAHA_S3_ACCESS_KEY',
      'WAHA_S3_SECRET_KEY',
    ]) {
      delete process.env[key];
    }
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
      database: { type: 'postgres', host: 'db.local', port: '5432', username: 'u', password: 'p', name: 'n', ssl: true },
      storage: { type: 's3', localPath: './m', s3: { endpoint: 'e', bucket: 'b', region: 'r', accessKeyId: 'ak', secretAccessKey: 'sk' } },
    });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.result).toBe(true);

    const env = readFileSync(join(workdir, '.env'), 'utf8');
    expect(env).toContain('EXISTING_KEY=keepme');       // untouched
    expect(env).toContain('WHATSAPP_DEFAULT_ENGINE=WEBJS');
    expect(env).toContain('WAHA_DB_TYPE=postgres');
    expect(env).toContain('WAHA_DB_PASSWORD=p');
    expect(env).toContain('WAHA_STORAGE_TYPE=s3');

    // The canonical switches the runtime actually reads are written too, so
    // the dashboard selection really moves the session store.
    expect(env).toContain('WAHA_DATABASE_DRIVER=postgres');
    expect(env).toContain('WAHA_DATABASE_URL=postgres://u:p@db.local:5432/n?sslmode=require');

    // Mirrored into process.env for immediate GET reflection.
    expect(process.env.WHATSAPP_DEFAULT_ENGINE).toBe('WEBJS');
    expect(process.env.WAHA_DB_TYPE).toBe('postgres');
    expect(process.env.WAHA_DATABASE_DRIVER).toBe('postgres');
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
    expect(cfg.database.password).toBe('p');
    expect(cfg.storage.type).toBe('s3');        // lowercased
    // The runtime badge: the resolved driver the app is actually using.
    expect(cfg.runtime.databaseDriver).toBe('postgres');
  });

  it('switching back to sqlite flips the canonical driver', async () => {
    const res = await put({
      database: { type: 'sqlite', host: 'localhost', port: '5432', username: '', password: '', name: './data/waha.sqlite', ssl: false },
    });
    expect(res.status).toBe(200);
    const env = readFileSync(join(workdir, '.env'), 'utf8');
    expect(env).toContain('WAHA_DATABASE_DRIVER=sqlite');

    const get = await app.request('/infra/config', { headers: { 'x-api-key': KEY } });
    const cfg = await get.json() as any;
    expect(cfg.runtime.databaseDriver).toBe('sqlite');
  });

  it('POST /infra/database/test reports connection failures with a message', async () => {
    const res = await app.request('/infra/database/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
      // Port 1 on loopback: refused immediately, no timeout wait.
      body: JSON.stringify({ host: '127.0.0.1', port: '1', username: 'u', password: 'p', name: 'n', ssl: false }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.ok).toBe(false);
    expect(typeof json.message).toBe('string');
  });
});

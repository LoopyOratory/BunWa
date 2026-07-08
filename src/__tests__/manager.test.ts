import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { container } from 'tsyringe';
import { configureContainer } from '../di/container';
import { SessionManager } from '../core/manager.core';
import { NotFoundException, BadRequestException } from '../core/exceptions';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeAll(() => {
    configureContainer();
    manager = container.resolve(SessionManager);
  });

  describe('exists', () => {
    it('returns false for unknown session', async () => {
      expect(await manager.exists('non-existent')).toBe(false);
    });
  });

  describe('isRunning', () => {
    it('returns false for unknown session', async () => {
      const result = await manager.isRunning('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getSession', () => {
    it('throws NotFoundException for unknown session', () => {
      expect(() => manager.getSession('non-existent')).toThrow(NotFoundException);
    });

    it('throws with session name in the message', () => {
      expect(() => manager.getSession('unknown-session'))
        .toThrow(/unknown-session/);
    });
  });

  describe('upsert', () => {
    it('rejects session name containing dots', async () => {
      await expect(manager.upsert('test.name')).rejects.toThrow(BadRequestException);
    });

    it('rejects session name containing forward slash', async () => {
      await expect(manager.upsert('test/name')).rejects.toThrow(BadRequestException);
    });

    it('rejects session name containing backslash', async () => {
      await expect(manager.upsert('test\\name')).rejects.toThrow(BadRequestException);
    });

    it('rejects session name containing spaces', async () => {
      await expect(manager.upsert('test name')).rejects.toThrow(BadRequestException);
    });

    it('rejects session name containing colon', async () => {
      await expect(manager.upsert('test:name')).rejects.toThrow(BadRequestException);
    });

    it('rejects empty session name', async () => {
      await expect(manager.upsert('')).rejects.toThrow(BadRequestException);
    });

    it('rejects session name longer than 64 characters', async () => {
      const longName = 'a'.repeat(65);
      await expect(manager.upsert(longName, {}))
        .rejects.toThrow(BadRequestException);
    });

    it('accepts session name of exactly 64 characters', async () => {
      const exactName = 'a'.repeat(64);
      await manager.upsert(exactName, {});
      expect(await manager.exists(exactName)).toBe(true);
      await manager.delete(exactName);
    });

    it('persists session config after upsert', async () => {
      const config = { webhooks: [{ url: 'https://example.com/webhook', events: ['message'] }] };
      await manager.upsert('persist-test', config);
      expect(await manager.exists('persist-test')).toBe(true);
      const retrieved = manager.getSessionConfig('persist-test');
      expect(retrieved).toBeDefined();
      expect(retrieved!.webhooks).toHaveLength(1);
      expect(retrieved!.webhooks![0].url).toBe('https://example.com/webhook');
      await manager.delete('persist-test');
    });

    it('creates session entry even without config', async () => {
      await manager.upsert('no-config-test');
      expect(await manager.exists('no-config-test')).toBe(true);
      expect(manager.getSessionConfig('no-config-test')).toBeUndefined();
      await manager.delete('no-config-test');
    });
  });

  describe('start', () => {
    it('returns session info with STARTING status', async () => {
      const result = await manager.start('start-test');
      expect(result).toBeDefined();
      expect(result.name).toBe('start-test');
      expect(result.status).toBe('STARTING');
    });

    it('creates a session entry that exists and is running', async () => {
      expect(await manager.exists('start-test')).toBe(true);
      expect(await manager.isRunning('start-test')).toBe(true);
    });

    it('allows starting a session that was already started (duplicate start)', async () => {
      const result = await manager.start('start-test');
      expect(result.name).toBe('start-test');
      expect(await manager.exists('start-test')).toBe(true);
    });

    // Cleanup start-test sessions
    afterAll(async () => {
      try {
        await manager.stop('start-test', true);
        await manager.delete('start-test');
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('stop', () => {
    it('stops a running session gracefully', async () => {
      await manager.upsert('stop-test');
      await manager.start('stop-test');
      expect(await manager.isRunning('stop-test')).toBe(true);

      await manager.stop('stop-test');
      expect(await manager.isRunning('stop-test')).toBe(false);
      expect(await manager.exists('stop-test')).toBe(true);
      await manager.delete('stop-test');
    });

    it('does not throw when stopping a non-existent session', async () => {
      await expect(manager.stop('non-existent-stop')).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes session completely from manager', async () => {
      await manager.upsert('delete-test');
      expect(await manager.exists('delete-test')).toBe(true);

      await manager.delete('delete-test');
      expect(await manager.exists('delete-test')).toBe(false);
      expect(() => manager.getSession('delete-test')).toThrow(NotFoundException);
    });

    it('does not throw when deleting a non-existent session', async () => {
      await expect(manager.delete('non-existent-delete')).resolves.toBeUndefined();
    });

    it('stops a running session before deleting it', async () => {
      await manager.upsert('delete-running-test');
      await manager.start('delete-running-test');
      expect(await manager.isRunning('delete-running-test')).toBe(true);

      await manager.delete('delete-running-test');
      expect(await manager.exists('delete-running-test')).toBe(false);
    });
  });

  describe('restart', () => {
    it('restarts a stopped session', async () => {
      await manager.upsert('restart-test');
      await manager.start('restart-test');
      await manager.stop('restart-test', true);

      const result = await manager.restart('restart-test');
      expect(result.name).toBe('restart-test');
      expect(result.status).toBe('STARTING');
      await manager.delete('restart-test');
    });
  });

  describe('resyncWebhooks', () => {
    it('preserves global env-webhook subscriptions across a resync', async () => {
      const name = 'resync-global-test';
      // Inject a fake global webhook so _start creates the global-event
      // subscriptions (WEBHOOK_URL is not configured in the test env).
      const fakeWebhook = { deliver: () => {} };
      const original = (manager as any).webhook;
      (manager as any).webhook = fakeWebhook;
      try {
        await manager.upsert(name);
        await manager.start(name);

        const before = ((manager as any).subscriptions.get(name) || []).length;
        // Global events (SESSION_STATUS/MESSAGE/MESSAGE_ANY) should be subscribed.
        expect(before).toBeGreaterThan(0);

        await manager.resyncWebhooks(name);

        const after = ((manager as any).subscriptions.get(name) || []).length;
        // Resync must restore the global subs it tore down, not drop them.
        expect(after).toBe(before);
      } finally {
        (manager as any).webhook = original;
        try {
          await manager.stop(name, true);
          await manager.delete(name);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('getSessions', () => {
    it('returns an array', async () => {
      const sessions = await manager.getSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('includes started sessions in the list', async () => {
      await manager.upsert('list-test');
      await manager.start('list-test');
      const sessions = await manager.getSessions();
      const found = sessions.find((s) => s.name === 'list-test');
      expect(found).toBeDefined();
      expect(found!.status).toBeDefined();
      await manager.delete('list-test');
    });
  });
});

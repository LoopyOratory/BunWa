/**
 * Per-session REST API key management.
 *
 * Admin only (CanServer): a scoped key must never manage keys, including for
 * its own session. Plaintext is returned once at creation/rotation; list
 * responses carry metadata only, never the hash.
 */
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanServer, Action } from '../middleware/policies';
import { SessionManager } from '../core/manager.core';
import { AuditService, AuditAction } from '../core/audit/audit.service';
import {
  createRestApiKeyRecord,
  normalizeRestApiKeyActions,
  toRestApiKeyMetadata,
} from '../core/api-keys/rest-api-keys';

export function createApiKeysRouter(): Hono {
  const router = new Hono();

  router.use('*', apiKeyAuthMiddleware());

  /** Resolve a session's config or return undefined when it does not exist. */
  function sessionConfig(manager: SessionManager, session: string) {
    return manager.getSessionConfig(session);
  }

  function notFound(session: string) {
    return { statusCode: 404, message: `Session ${session} not found` };
  }

  /**
   * GET /api/sessions/:session/api-keys
   * Lists key metadata. The hash is never included.
   */
  router.get('/sessions/:session/api-keys',
    policiesMiddleware(CanServer(Action.Read)),
    (c) => {
      const manager = container.resolve(SessionManager);
      const session = c.req.param('session');
      const config = sessionConfig(manager, session);
      if (!config) return c.json(notFound(session), 404);

      const keys = [...(config.restApiKeys ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(toRestApiKeyMetadata);

      return c.json({ keys });
    },
  );

  /**
   * POST /api/sessions/:session/api-keys
   * Creates a key. Body: `{ name?, actions? }`. The plaintext is returned once.
   */
  router.post('/sessions/:session/api-keys',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const session = c.req.param('session');
      const config = sessionConfig(manager, session);
      if (!config) return c.json(notFound(session), 404);

      const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
      const rawName = (body as Record<string, unknown>).name;
      if (rawName !== undefined && typeof rawName !== 'string') {
        return c.json({ statusCode: 400, message: 'name must be a string' }, 400);
      }
      const name = (rawName as string | undefined)?.trim() || 'default';
      if (name.length > 64) {
        return c.json({ statusCode: 400, message: 'name must be 64 characters or less' }, 400);
      }

      const { actions, error } = normalizeRestApiKeyActions((body as Record<string, unknown>).actions);
      if (error) {
        return c.json({ statusCode: 400, message: error }, 400);
      }

      const { key, record } = createRestApiKeyRecord(session, name, actions);
      await manager.upsert(session, {
        ...config,
        restApiKeys: [...(config.restApiKeys ?? []), record],
      }, { allowManagedKeys: true });

      container.resolve(AuditService).logInfo(AuditAction.API_KEY_CREATED, {
        apiKeyId: record.id,
        apiKeyName: record.name,
        sessionName: session,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        metadata: { actions: record.actions, scope: 'rest' },
      });

      return c.json({
        key,
        keyHash: record.keyHash,
        ...toRestApiKeyMetadata(record),
      });
    },
  );

  /**
   * DELETE /api/sessions/:session/api-keys/:id
   * Revokes a key (soft delete; the record stays for the audit trail).
   */
  router.delete('/sessions/:session/api-keys/:id',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const session = c.req.param('session');
      const config = sessionConfig(manager, session);
      if (!config) return c.json(notFound(session), 404);

      const record = config.restApiKeys?.find((candidate) => candidate.id === c.req.param('id'));
      if (!record) {
        return c.json({ statusCode: 404, message: 'Key not found' }, 404);
      }

      if (!record.revokedAt) {
        record.revokedAt = new Date().toISOString();
        await manager.upsert(session, {
          ...config,
          restApiKeys: [...(config.restApiKeys ?? [])],
        }, { allowManagedKeys: true });
        container.resolve(AuditService).logInfo(AuditAction.API_KEY_REVOKED, {
          apiKeyId: record.id,
          apiKeyName: record.name,
          sessionName: session,
          method: c.req.method,
          path: new URL(c.req.url).pathname,
          metadata: { scope: 'rest' },
        });
      }

      return c.json(toRestApiKeyMetadata(record));
    },
  );

  /**
   * POST /api/sessions/:session/api-keys/:id/rotate
   * Replaces the secret material in place. Returns the new plaintext once.
   */
  router.post('/sessions/:session/api-keys/:id/rotate',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const manager = container.resolve(SessionManager);
      const session = c.req.param('session');
      const config = sessionConfig(manager, session);
      if (!config) return c.json(notFound(session), 404);

      const record = config.restApiKeys?.find((candidate) => candidate.id === c.req.param('id'));
      if (!record) {
        return c.json({ statusCode: 404, message: 'Key not found' }, 404);
      }
      if (record.revokedAt) {
        return c.json({ statusCode: 400, message: 'Revoked keys cannot be rotated' }, 400);
      }

      const { key, record: fresh } = createRestApiKeyRecord(session, record.name, record.actions as Action[]);
      record.keyHash = fresh.keyHash;
      record.prefix = fresh.prefix;
      record.lastUsedAt = undefined;
      await manager.upsert(session, {
        ...config,
        restApiKeys: [...(config.restApiKeys ?? [])],
      }, { allowManagedKeys: true });

      container.resolve(AuditService).logInfo(AuditAction.API_KEY_CREATED, {
        apiKeyId: record.id,
        apiKeyName: record.name,
        sessionName: session,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        metadata: { actions: record.actions, scope: 'rest', rotated: true },
      });

      return c.json({
        key,
        keyHash: record.keyHash,
        ...toRestApiKeyMetadata(record),
      });
    },
  );

  return router;
}

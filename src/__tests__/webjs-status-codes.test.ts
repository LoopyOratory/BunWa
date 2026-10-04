import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'bun:test';
import { Hono } from 'hono';
import { container } from 'tsyringe';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApiRouter } from '../api';
import { AuditService } from '../core/audit/audit.service';
import { SessionManager } from '../core/manager.core';
import { WhatsappConfigService } from '../config.service';
import { globalErrorHandler } from '../middleware/error-handler';
import { WhatsappSessionWebJs } from '../core/engines/webjs/session.webjs.core';
import {
  isClientFacingError,
  NotImplementedByEngineError,
  NotFoundException,
} from '../core/exceptions';
import { WAHASessionStatus } from '../structures/enums.dto';

// The WEBJS engine must answer a missing chat as 404 and an operation its
// library or WhatsApp Web build cannot do as 422 naming WEBJS, never as a 500.
process.env.WAHA_API_KEY = 'webjs-status-test-key';

const API_KEY = 'webjs-status-test-key';

function makeSession(): WhatsappSessionWebJs {
  const session = new WhatsappSessionWebJs({
    name: 'webjs-status-test',
    printQR: false,
    mediaManager: null as any,
    loggerBuilder: {
      child: () => ({
        info: () => {},
        debug: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
      }),
    } as any,
    sessionStore: null as any,
    proxyConfig: undefined,
    sessionConfig: {},
    engineConfig: {},
    ignore: { status: false, groups: false, channels: false, broadcast: false },
  });
  session.status = WAHASessionStatus.WORKING;
  return session;
}

describe('WEBJS status codes', () => {
  describe('engine errors', () => {
    it('names WEBJS in a gated error instead of the process default engine', () => {
      const session = makeSession();
      try {
        (session as any).getPresences();
        throw new Error('getPresences should have refused');
      } catch (error: any) {
        expect(error).toBeInstanceOf(NotImplementedByEngineError);
        expect(error.message).toContain("'WEBJS' engine");
        expect(error.message).not.toContain("'NOWEB' engine");
      }
    });

    it('treats gated engine errors as client facing so routes do not flatten them to 500', () => {
      expect(isClientFacingError(new NotImplementedByEngineError('', 'WEBJS'))).toBe(true);
    });

    it('answers a chat the engine cannot resolve with NotFoundException naming it', async () => {
      const session = makeSession();
      (session as any).client = {
        getChatById: async () => {
          throw new Error('No LID for user');
        },
      };
      await expect(
        (session as any).getChatMessages('00000000000@s.whatsapp.net', { limit: 10 }, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        (session as any).getChatMessages('00000000000@s.whatsapp.net', { limit: 10 }, {}),
      ).rejects.toThrow('00000000000@s.whatsapp.net');
    });

    it('answers an invalid number as not resolvable instead of throwing', async () => {
      const session = makeSession();
      (session as any).client = {
        getNumberId: async () => {
          throw new Error('wid error: invalid wid');
        },
      };
      const result = await (session as any).checkNumberStatus({ phone: '00000000000' });
      expect(result.exists).toBe(false);
      expect(result.canReceiveMessage).toBe(false);
      expect(result.status).toBe('not_resolvable');
      expect(result.reason).toContain('invalid');
    });

    it('answers a media send the library cannot perform as 422, not 500', async () => {
      const session = makeSession();
      (session as any).client = {
        sendMessage: async () => {
          throw new Error('Data passed to getter must include an id property (it is how we memoize) but got undefined');
        },
      };
      await expect(
        (session as any).sendImage({
          chatId: '233553919737@c.us',
          file: { data: Buffer.from('image-bytes').toString('base64'), mimetype: 'image/png' },
        }),
      ).rejects.toThrow("'WEBJS' engine");
    });

    it('answers a forward the library cannot perform as 422, not 500', async () => {
      const session = makeSession();
      (session as any).client = {
        getChats: async () => [
          {
            fetchMessages: async () => [
              { id: { fromMe: true, remote: '218734094458920@lid', id: 'ABC' }, forward: async () => { throw new Error("Cannot read properties of undefined (reading 'forwardMessages')"); } },
            ],
          },
        ],
      };
      await expect(
        (session as any).forwardMessage({
          chatId: '233553919737@c.us',
          messageId: 'true_218734094458920@lid_ABC',
        }),
      ).rejects.toThrow("'WEBJS' engine");
    });

    it('answers a group invite code the library cannot fetch as 422, not 500', async () => {
      const session = makeSession();
      (session as any).client = {
        getChatById: async () => ({
          isGroup: true,
          id: { _serialized: '120363427492440120@g.us' },
          getInviteCode: async () => {
            throw new Error("Cannot read properties of undefined (reading 'fetchMexGroupInviteCode')");
          },
        }),
      };
      await expect(
        (session as any).getInviteCode('120363427492440120@g.us'),
      ).rejects.toThrow("'WEBJS' engine");
    });

    it('still answers a genuinely missing forward source as 404', async () => {
      const session = makeSession();
      (session as any).client = { getChats: async () => [] };
      await expect(
        (session as any).forwardMessage({
          chatId: '233553919737@c.us',
          messageId: 'true_218734094458920@lid_MISSING',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('route stubs delegate to the engine', () => {
    let app: Hono;

    beforeAll(() => {
      container.registerInstance(
        AuditService,
        new AuditService(mkdtempSync(join(tmpdir(), 'bunwa-webjs-status-audit-'))),
      );
      container.registerInstance(WhatsappConfigService, new WhatsappConfigService());
      const session = makeSession();
      // Every gated method throws through the engine base helper, naming WEBJS.
      const refuse = () => {
        throw new NotImplementedByEngineError('', 'WEBJS');
      };
      (session as any).clearMessages = refuse;
      (session as any).blockContact = refuse;
      (session as any).unblockContact = refuse;
      (session as any).updateGroupPicture = refuse;
      (session as any).setStar = refuse;
      (session as any).getPresences = refuse;

      container.registerInstance(SessionManager, {
        getWorkingSession: async () => session,
        getSession: () => session,
      } as any);

      app = new Hono();
      app.route('/', createApiRouter());
      app.onError(globalErrorHandler);
    });

    const send = (method: string, path: string, body?: unknown): Promise<Response> =>
      app.fetch(
        new Request(`http://localhost${path}`, {
          method,
          headers: { 'x-api-key': API_KEY, ...(body ? { 'content-type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );

    const expect422NamingWebjs = async (res: Response): Promise<void> => {
      expect(res.status).toBe(422);
      const body: any = await res.json();
      expect(body.message).toContain("'WEBJS' engine");
      expect(body.message).not.toContain('Internal server error');
    };

    it('DELETE /api/:session/chats/:chatId/messages answers 422 for a gated clear', async () => {
      await expect422NamingWebjs(await send('DELETE', '/api/webjs-status-test/chats/233553919737@c.us/messages'));
    });

    it('POST /api/contacts/block answers 422 for a gated block', async () => {
      await expect422NamingWebjs(
        await send('POST', '/api/contacts/block', {
          session: 'webjs-status-test',
          contactId: '233553919737@c.us',
        }),
      );
    });

    it('POST /api/contacts/unblock answers 422 for a gated unblock', async () => {
      await expect422NamingWebjs(
        await send('POST', '/api/contacts/unblock', {
          session: 'webjs-status-test',
          contactId: '233553919737@c.us',
        }),
      );
    });

    it('PUT /api/:session/groups/:id/picture answers 422 for a gated update', async () => {
      await expect422NamingWebjs(
        await send('PUT', '/api/webjs-status-test/groups/120363427492440120@g.us/picture', {
          data: 'aW1hZ2U=',
          mimetype: 'image/png',
        }),
      );
    });

    it('PUT /api/star answers 422 for a gated star instead of a 500', async () => {
      await expect422NamingWebjs(
        await send('PUT', '/api/star', {
          session: 'webjs-status-test',
          chatId: '233553919737@c.us',
          messageId: 'true_218734094458920@lid_ABC',
          star: true,
        }),
      );
    });

    it('GET /api/:session/presence answers 422 for gated presence getters', async () => {
      await expect422NamingWebjs(await send('GET', '/api/webjs-status-test/presence'));
    });
  });
});

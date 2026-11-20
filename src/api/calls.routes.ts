import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';

/**
 * WhatsApp call endpoints.
 *
 * Only the WEBJS engine can place calls: it drives WhatsApp Web's own VoIP
 * stack. BUNWEB (Baileys) can receive call events and reject them, but has no
 * call engine, so these routes answer 501 for it.
 */
export function createCallsRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();

  router.use('*', apiKeyAuthMiddleware());

  const unsupported = (c: any, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const unavailable = /not available|not ready|not supported|not a function/i.test(message);
    return c.json({ error: message }, unavailable ? 501 : 500);
  };

  /**
   * The call engine lives in WEBJS. BUNWEB (Baileys) can receive call events and
   * reject them, but it has no outgoing call or audio path, so answer 501
   * instead of letting a missing method surface as a 500.
   */
  const webjsOnly = (c: any, session: any, methods: string[]) => {
    const missing = methods.find((method) => typeof session?.[method] !== 'function');
    if (!missing) return null;
    return c.json(
      { error: 'Calls require the WEBJS engine; BUNWEB has no call engine' },
      501,
    );
  };

  router.post('/:session/calls/reject',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json().catch(() => ({}));
      try {
        await (session as any).rejectCall(body.from, body.id);
        return c.json({ result: true });
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  router.post('/:session/calls/start',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json().catch(() => ({}));
      if (!body.chatId) return c.json({ error: 'chatId is required' }, 400);
      const blocked = webjsOnly(c, session, ['startCall']);
      if (blocked) return blocked;
      try {
        const call = await (session as any).startCall(body.chatId, {
          video: !!body.video,
          waitForAnswer: !!body.waitForAnswer,
          timeoutMs: body.timeoutMs,
          injectAudio: body.injectAudio !== false,
        });
        return c.json({ call });
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  router.post('/:session/calls/end',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json().catch(() => ({}));
      const blocked = webjsOnly(c, session, ['endCall']);
      if (blocked) return blocked;
      try {
        const result = await (session as any).endCall(body.callId);
        return c.json({ result });
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  router.get('/:session/calls/active',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const blocked = webjsOnly(c, session, ['getActiveCall']);
      if (blocked) return blocked;
      try {
        const call = await (session as any).getActiveCall();
        return c.json({ call });
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  /**
   * Check whether this WhatsApp Web build still exposes the private call
   * modules. Run this before a live call; module names change between builds.
   */
  router.get('/:session/calls/diagnostics',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const blocked = webjsOnly(c, session, ['callDiagnostics']);
      if (blocked) return blocked;
      try {
        const diagnostics = await (session as any).callDiagnostics();
        return c.json(diagnostics);
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  router.post('/:session/calls/accept',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json().catch(() => ({}));
      if (!body.callId) return c.json({ error: 'callId is required' }, 400);
      const blocked = webjsOnly(c, session, ['acceptCall']);
      if (blocked) return blocked;
      try {
        const result = await (session as any).acceptCall(
          body.callId,
          !!body.video,
          body.injectAudio !== false,
        );
        return c.json({ result });
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  /**
   * Inject a base64 audio clip (MP3/OGG/WAV) into the live call. This is the
   * agent's voice: generate TTS in Node, post it here, and the other party
   * hears it through WhatsApp's own audio path.
   */
  router.post('/:session/calls/speak',
    policiesMiddleware(CanSession(Action.Send, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json().catch(() => ({}));
      const audio = body.audio || body.audioBase64;
      if (!audio || typeof audio !== 'string') {
        return c.json({ error: 'audio (base64) is required' }, 400);
      }
      const blocked = webjsOnly(c, session, ['playCallAudio']);
      if (blocked) return blocked;
      try {
        const duration = await (session as any).playCallAudio(audio);
        return c.json({ result: true, duration });
      } catch (err) {
        return unsupported(c, err);
      }
    }
  );

  /**
   * Server-sent events with the remote party's audio, base64 encoded. The
   * browser taps the call's WebAudio graph and emits WebM/Opus segments every
   * ~250 ms. Consumers run STT on these chunks and post replies to /speak.
   */
  router.get('/:session/calls/audio',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      if (typeof session.onCallAudio !== 'function') {
        return c.json({ error: 'call audio is not available for this engine' }, 501);
      }
      return streamSSE(c, async (stream) => {
        let unsubscribe = () => undefined;
        const closed = new Promise<void>((resolve) => {
          unsubscribe = session.onCallAudio(async (chunk: any) => {
            try {
              await stream.writeSSE({ event: 'audio', data: JSON.stringify(chunk) });
            } catch {
              unsubscribe();
              resolve();
            }
          });
          stream.onAbort(() => {
            unsubscribe();
            resolve();
          });
        });
        await closed;
      });
    }
  );

  return router;
}

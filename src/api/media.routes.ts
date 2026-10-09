import { Hono } from 'hono';
import { container } from 'tsyringe';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { policiesMiddleware, CanSession, Action, FromParam } from '../middleware/policies';
import { workingSessionResolver } from '../middleware/session-resolver';
import { materializeAudioBytes, isOggOpus } from '../core/media/audio';

export function createMediaRouter(): Hono<{ Variables: { session: any; body: any } }> {
  const router = new Hono<{ Variables: { session: any; body: any } }>();

  router.use('*', apiKeyAuthMiddleware());

  router.post('/:session/media/convert/voice',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      if (!body?.file) {
        return c.json({ statusCode: 400, message: 'file is required (URL, base64, or data URL)' }, 400);
      }
      const input = await materializeAudioBytes(body.file);
      const opus = isOggOpus(input) ? input : await (session as any).mediaConverter.voice(input);
      return c.json({ data: opus.toString('base64'), mimetype: 'audio/ogg; codecs=opus' });
    }
  );

  router.post('/:session/media/convert/video',
    policiesMiddleware(CanSession(Action.Read, FromParam('session'))),
    workingSessionResolver(),
    async (c) => {
      const session = c.get('session');
      const body = await c.req.json();
      if (!body?.file) {
        return c.json({ statusCode: 400, message: 'file is required (URL, base64, or data URL)' }, 400);
      }
      const input = await materializeAudioBytes(body.file);
      const mp4 = await (session as any).mediaConverter.video(input);
      return c.json({ data: mp4.toString('base64'), mimetype: 'video/mp4' });
    }
  );

  return router;
}

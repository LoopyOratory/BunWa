import { Hono } from 'hono';
import { createPingRouter } from './ping.routes';
import { createHealthRouter } from './health.routes';
import { createVersionRouter } from './version.routes';
import { createServerRouter } from './server.routes';
import { createSessionsRouter } from './sessions.routes';
import { createChattingRouter } from './chatting.routes';
import { createChatsRouter } from './chats.routes';
import { createContactsRouter } from './contacts.routes';
import { createContactsSessionRouter } from './contacts.session.routes';
import { createGroupsRouter } from './groups.routes';
import { createChannelsRouter } from './channels.routes';
import { createLabelsRouter } from './labels.routes';
import { createPresenceRouter } from './presence.routes';
import { createProfileRouter } from './profile.routes';
import { createStatusRouter } from './status.routes';
import { createAuthRouter } from './auth.routes';
import { createCallsRouter } from './calls.routes';
import { createEventsRouter } from './events.routes';
import { createLidsRouter } from './lids.routes';
import { createApiKeysRouter } from './apikeys.routes';
import { createScreenshotRouter } from './screenshot.routes';
import { createMediaRouter } from './media.routes';
import { createAppsRouter } from './apps.routes';
import { createWorkersRouter } from './workers.routes';

export function createApiRouter(): Hono {
  const router = new Hono();

  router.route('/ping', createPingRouter());
  router.route('/health', createHealthRouter());
  router.route('/api/version', createVersionRouter());
  router.route('/api/server', createServerRouter());
  router.route('/api/sessions', createSessionsRouter());
  router.route('/api', createChattingRouter());
  router.route('/api', createChatsRouter());
  router.route('/api', createContactsRouter());
  router.route('/api', createGroupsRouter());
  router.route('/api', createChannelsRouter());
  router.route('/api', createLabelsRouter());
  router.route('/api', createPresenceRouter());
  router.route('/api', createProfileRouter());
  router.route('/api', createStatusRouter());
  router.route('/api', createAuthRouter());
  router.route('/api', createCallsRouter());
  router.route('/api', createEventsRouter());
  router.route('/api', createLidsRouter());
  router.route('/api', createApiKeysRouter());
  router.route('/api', createScreenshotRouter());
  router.route('/api', createMediaRouter());
  router.route('/api', createAppsRouter());
  router.route('/api', createWorkersRouter());

  return router;
}

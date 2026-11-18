import { Hono } from 'hono';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { Action, CanServer, policiesMiddleware } from '../middleware/policies';
import { agentService } from '../core/agent/agent.service';
import { conversationLifecycle } from '../core/agent/conversation-lifecycle';
import type { BuilderAnswers } from '../core/agent/agent.builder';

function badRequest(c: any, message: string) {
  return c.json({ error: message }, 400);
}

function notFound(c: any, message = 'Not found') {
  return c.json({ error: message }, 404);
}

export function createAgentsRouter(): Hono {
  const router = new Hono();
  router.use('*', apiKeyAuthMiddleware());

  /* ---------------------------------------------------------------------- */
  /* Guided builder                                                          */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/builder/questions',
    policiesMiddleware(CanServer(Action.Retrieve)),
    (c) => c.json({ questions: agentService.builderQuestions() }),
  );

  router.post(
    '/builder/next',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const answers = (body.answers ?? body) as BuilderAnswers;
      return c.json({
        next: agentService.builderNext(answers),
        prompt: agentService.builderPrompt(answers),
      });
    },
  );

  router.post(
    '/builder/prompt',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const answers = (body.answers ?? body) as BuilderAnswers;
      return c.json({ prompt: agentService.builderPrompt(answers) });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Agents                                                                  */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/analytics',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json(await agentService.analytics(c.req.query('agentId') || undefined)),
  );

  /* ---------------------------------------------------------------------- */
  /* Model provider settings                                                */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/models/settings',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ settings: await agentService.getModelSettings() }),
  );

  router.put(
    '/models/settings',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const provider = body.provider === 'anthropic' ? 'anthropic' : body.provider === 'openai-compatible' ? 'openai-compatible' : undefined;
      const fallbackProvider =
        body.fallbackProvider === 'anthropic'
          ? 'anthropic'
          : body.fallbackProvider === 'openai-compatible'
            ? 'openai-compatible'
            : undefined;
      const settings = await agentService.updateModelSettings({
        provider,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        apiKey: body.apiKey === null ? null : typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined,
        model: typeof body.model === 'string' ? body.model : undefined,
        fallbackProvider,
        fallbackBaseUrl: typeof body.fallbackBaseUrl === 'string' ? body.fallbackBaseUrl : undefined,
        fallbackApiKey:
          body.fallbackApiKey === null
            ? null
            : typeof body.fallbackApiKey === 'string' && body.fallbackApiKey.trim()
              ? body.fallbackApiKey.trim()
              : undefined,
        fallbackModel: typeof body.fallbackModel === 'string' ? body.fallbackModel : undefined,
      });
      return c.json({ settings });
    },
  );

  router.post(
    '/models/settings/test',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => c.json({ results: await agentService.testModelSettings() }),
  );

  router.get(
    '/',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ agents: await agentService.listAgents() }),
  );

  router.post(
    '/',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.name || typeof body.name !== 'string') return badRequest(c, 'name is required');
      const agent = await agentService.createAgent({
        name: body.name,
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
        model: typeof body.model === 'string' ? body.model : null,
        fallbackModel: typeof body.fallbackModel === 'string' ? body.fallbackModel : null,
        voice: typeof body.voice === 'string' ? body.voice : null,
        settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
      });
      if (Array.isArray(body.skills)) {
        for (const skill of body.skills) {
          if (!skill?.name || !skill?.instructions) continue;
          await agentService.addSkill(agent.id, {
            name: String(skill.name),
            description: typeof skill.description === 'string' ? skill.description : '',
            instructions: String(skill.instructions),
            enabled: skill.enabled !== false,
          });
        }
      }
      if (Array.isArray(body.knowledge)) {
        for (const source of body.knowledge) {
          if (!source?.name || !source?.content) continue;
          await agentService.addKnowledge(agent.id, {
            name: String(source.name),
            kind: source.kind === 'url' || source.kind === 'file' ? source.kind : 'text',
            content: String(source.content),
            metadata: source.metadata && typeof source.metadata === 'object' ? source.metadata : {},
          });
        }
      }
      return c.json({ agent }, 201);
    },
  );

  router.get(
    '/:id/effective-prompt',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const prompt = await agentService.effectivePrompt(c.req.param('id'));
      if (prompt === null) return notFound(c, 'Agent not found');
      return c.json({ prompt });
    },
  );

  router.get(
    '/:id/skills',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ skills: await agentService.listSkills(c.req.param('id')) }),
  );

  router.post(
    '/:id/skills',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.name || !body?.instructions) return badRequest(c, 'name and instructions are required');
      const skill = await agentService.addSkill(c.req.param('id'), {
        name: String(body.name),
        description: typeof body.description === 'string' ? body.description : '',
        instructions: String(body.instructions),
        enabled: body.enabled !== false,
      });
      return c.json({ skill }, 201);
    },
  );

  router.delete(
    '/:id/skills/:skillId',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const removed = await agentService.deleteSkill(c.req.param('id'), c.req.param('skillId'));
      if (!removed) return notFound(c, 'Skill not found');
      return c.json({ ok: true });
    },
  );

  router.get(
    '/:id/knowledge',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ knowledge: await agentService.listKnowledge(c.req.param('id')) }),
  );

  router.post(
    '/:id/knowledge',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.name || !body?.content) return badRequest(c, 'name and content are required');
      const source = await agentService.addKnowledge(c.req.param('id'), {
        name: String(body.name),
        kind: body.kind === 'url' || body.kind === 'file' ? body.kind : 'text',
        content: String(body.content),
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      });
      return c.json({ source }, 201);
    },
  );

  router.delete(
    '/:id/knowledge/:sourceId',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const removed = await agentService.deleteKnowledge(c.req.param('id'), c.req.param('sourceId'));
      if (!removed) return notFound(c, 'Knowledge source not found');
      return c.json({ ok: true });
    },
  );

  router.get(
    '/:id/analytics',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json(await agentService.analytics(c.req.param('id'))),
  );

  router.get(
    '/:id',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      return c.json({ agent });
    },
  );

  router.get(
    '/:id/mcp',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const mcp = (agent.settings?.mcp as Record<string, unknown> | undefined) ?? {
        enabled: false,
        allowedTools: [],
        deniedTools: [],
        destructiveOps: false,
      };
      return c.json({ mcp });
    },
  );

  router.put(
    '/:id/mcp',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const body = await c.req.json().catch(() => ({}));
      const current = (agent.settings?.mcp as Record<string, unknown> | undefined) ?? {
        enabled: false,
        allowedTools: [],
        deniedTools: [],
        destructiveOps: false,
      };
      const next: Record<string, unknown> = { ...current };
      if (body.enabled !== undefined) next.enabled = body.enabled !== false;
      if (Array.isArray(body.allowedTools)) next.allowedTools = body.allowedTools.map(String);
      if (Array.isArray(body.deniedTools)) next.deniedTools = body.deniedTools.map(String);
      if (body.destructiveOps !== undefined) next.destructiveOps = body.destructiveOps === true;
      const updated = await agentService.updateAgent(c.req.param('id'), {
        settings: { ...agent.settings, mcp: next },
      });
      if (!updated) return notFound(c, 'Agent not found');
      return c.json({ mcp: updated.settings?.mcp ?? next });
    },
  );

  router.put(
    '/:id',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const agent = await agentService.updateAgent(c.req.param('id'), {
        name: typeof body.name === 'string' ? body.name : undefined,
        status: body.status,
        prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
        model: body.model === null || typeof body.model === 'string' ? body.model : undefined,
        fallbackModel: body.fallbackModel === null || typeof body.fallbackModel === 'string' ? body.fallbackModel : undefined,
        voice: body.voice === null || typeof body.voice === 'string' ? body.voice : undefined,
        settings: body.settings && typeof body.settings === 'object' ? body.settings : undefined,
      });
      if (!agent) return notFound(c, 'Agent not found');
      return c.json({ agent });
    },
  );

  router.delete(
    '/:id',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const removed = await agentService.deleteAgent(c.req.param('id'));
      if (!removed) return notFound(c, 'Agent not found');
      return c.json({ ok: true });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* User profiles                                                           */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/profiles/:userId',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const profile = await agentService.getUserProfile(c.req.param('userId'));
      if (!profile) return notFound(c, 'Profile not found');
      return c.json({ profile });
    },
  );

  router.put(
    '/profiles/:userId',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const profile = await agentService.upsertUserProfile({
        userId: c.req.param('userId'),
        displayName: body.displayName,
        phone: body.phone,
        email: body.email,
        timezone: body.timezone,
        locale: body.locale,
        notes: body.notes,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        customFields: body.customFields,
        preferences: body.preferences,
        importantDetails: body.importantDetails,
        lastSeenAt: body.lastSeenAt,
      });
      return c.json({ profile });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Conversations + reviews                                                 */
  /* ---------------------------------------------------------------------- */

  router.post(
    '/:id/conversations',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const configuredReview = agent.settings?.reviewEnabled !== false;
      const conversation = await agentService.createConversation({
        agentId: c.req.param('id'),
        userId: typeof body.userId === 'string' ? body.userId : null,
        channel: typeof body.channel === 'string' ? body.channel : 'whatsapp',
        reviewEnabled: body.reviewEnabled === undefined ? configuredReview : body.reviewEnabled !== false,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      });
      await agentService.recordEvent({
        type: 'conversation.started',
        agentId: conversation.agentId,
        conversationId: conversation.id,
        userId: conversation.userId,
      });
      return c.json({ conversation }, 201);
    },
  );

  router.get(
    '/conversations/:id',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const conversation = await agentService.getConversation(c.req.param('id'));
      if (!conversation) return notFound(c, 'Conversation not found');
      return c.json({ conversation });
    },
  );

  router.post(
    '/conversations/:id/close',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      conversationLifecycle.cancel(c.req.param('id'));
      const conversation = await agentService.closeConversation(c.req.param('id'));
      if (!conversation) return notFound(c, 'Conversation not found');
      await agentService.recordEvent({
        type: 'conversation.closed',
        agentId: conversation.agentId,
        conversationId: conversation.id,
        userId: conversation.userId,
      });
      return c.json({ conversation });
    },
  );

  router.post(
    '/conversations/:id/schedule-close',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.session || !body?.chatId) return badRequest(c, 'session and chatId are required');
      const conversation = await agentService.getConversation(c.req.param('id'));
      if (!conversation) return notFound(c, 'Conversation not found');
      if (!conversation.reviewEnabled) {
        const closeAt = new Date(Date.now() + Math.max(1, Number(body.closesInSeconds ?? 60)) * 1000).toISOString();
        conversationLifecycle.scheduleClose(c.req.param('id'), {
          session: String(body.session),
          chatId: String(body.chatId),
          closesInSeconds: Math.max(1, Number(body.closesInSeconds ?? 60)),
          reviewLeadSeconds: Math.max(0, Number(body.reviewLeadSeconds ?? 10)),
          message: typeof body.message === 'string' ? body.message : undefined,
        });
        return c.json({ scheduled: true, reviewAt: null, closeAt });
      }
      const schedule = conversationLifecycle.scheduleClose(c.req.param('id'), {
        session: String(body.session),
        chatId: String(body.chatId),
        closesInSeconds: Math.max(1, Number(body.closesInSeconds ?? 60)),
        reviewLeadSeconds: Math.max(0, Number(body.reviewLeadSeconds ?? 10)),
        message: typeof body.message === 'string' ? body.message : undefined,
      });
      await agentService.recordEvent({
        type: 'conversation.close_scheduled',
        agentId: conversation.agentId,
        conversationId: conversation.id,
        userId: conversation.userId,
        data: { ...schedule, session: body.session, chatId: body.chatId },
      });
      return c.json({ scheduled: true, ...schedule });
    },
  );

  router.post(
    '/conversations/:id/review-request',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const conversation = await agentService.setReviewRequested(c.req.param('id'));
      if (!conversation) return notFound(c, 'Conversation not found');
      await agentService.recordEvent({
        type: 'review.requested',
        agentId: conversation.agentId,
        conversationId: conversation.id,
        userId: conversation.userId,
      });
      return c.json({ conversation });
    },
  );

  router.post(
    '/conversations/:id/review',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const rating = Number(body.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) return badRequest(c, 'rating must be 1..5');
      const conversation = await agentService.submitReview(c.req.param('id'), rating, typeof body.text === 'string' ? body.text : undefined);
      if (!conversation) return notFound(c, 'Conversation not found');
      await agentService.recordEvent({
        type: 'review.submitted',
        agentId: conversation.agentId,
        conversationId: conversation.id,
        userId: conversation.userId,
        data: { rating, text: body.text ?? null },
      });
      return c.json({ conversation });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Analytics events                                                        */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/events',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({
      events: await agentService.listEvents({
        agentId: c.req.query('agentId') || undefined,
        conversationId: c.req.query('conversationId') || undefined,
        type: c.req.query('type') || undefined,
        limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      }),
    }),
  );

  router.post(
    '/events',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.type) return badRequest(c, 'type is required');
      const event = await agentService.recordEvent({
        type: String(body.type),
        agentId: typeof body.agentId === 'string' ? body.agentId : null,
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
        userId: typeof body.userId === 'string' ? body.userId : null,
        data: body.data && typeof body.data === 'object' ? body.data : {},
      });
      return c.json({ event }, 201);
    },
  );

  return router;
}

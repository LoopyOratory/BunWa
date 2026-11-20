import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomBytes } from 'crypto';
import { apiKeyAuthMiddleware } from '../middleware/api-key-auth';
import { Action, CanServer, policiesMiddleware } from '../middleware/policies';
import { agentService } from '../core/agent/agent.service';
import { conversationLifecycle } from '../core/agent/conversation-lifecycle';
import type { BuilderAnswers } from '../core/agent/agent.builder';
import type { Agent, AgentEngagement, AgentEngagementKind } from '../core/agent/agent.types';
import { wsTickets } from './websocket-auth';
import { validateToolDefinition } from '../core/tools/tool-schema';
import { toFishWebhookTool } from '../core/tools/fish-tool.adapter';
import { toGoogleFunctionDeclaration, toMcpToolDescriptor } from '../core/tools/google-tool.adapter';
import { hashSecret, openSecret, sealSecret, secretPrefix } from '../core/security/secret-box';
import { extractDocumentText } from '../core/knowledge/extract';
import { isAnalyticsChannel, isAnalyticsRange, resolveAnalyticsWindow } from '../core/agent/agent.analytics';

function badRequest(c: Context, message: string) {
  return c.json({ error: message }, 400);
}

function notFound(c: Context, message = 'Not found') {
  return c.json({ error: message }, 404);
}

/** Strip stored key material; the browser only needs metadata. */
function publicAgentMcp(mcp: Record<string, unknown>) {
  const { apiKeyHash: _hash, apiKeyCiphertext: _ciphertext, ...rest } = mcp;
  return {
    ...rest,
    hasApiKey: Boolean(_hash),
    canRevealKey: Boolean(_ciphertext),
    apiKeyPrefix: typeof rest.apiKeyPrefix === 'string' ? rest.apiKeyPrefix : null,
    apiKeyCreatedAt: typeof rest.apiKeyCreatedAt === 'string' ? rest.apiKeyCreatedAt : null,
    apiKeyLastUsedAt: typeof rest.apiKeyLastUsedAt === 'string' ? rest.apiKeyLastUsedAt : null,
  };
}

/** Strip key material from an agent before it leaves the API. */
function publicAgent(agent: Agent & { engaged?: AgentEngagement | null }): Agent & { engaged?: AgentEngagement | null } {
  const settings = { ...(agent.settings ?? {}) };
  const rawMcp = settings.mcp;
  if (rawMcp && typeof rawMcp === 'object' && !Array.isArray(rawMcp)) {
    const mcp = { ...(rawMcp as Record<string, unknown>) };
    const hasApiKey = Boolean(mcp.apiKeyHash);
    const canRevealKey = Boolean(mcp.apiKeyCiphertext);
    delete mcp.apiKeyHash;
    delete mcp.apiKeyCiphertext;
    mcp.hasApiKey = hasApiKey;
    mcp.canRevealKey = canRevealKey;
    settings.mcp = mcp;
  }
  return { ...agent, settings };
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

  /* ---------------------------------------------------------------------- */
  /* Tool compatibility                                                      */
  /* ---------------------------------------------------------------------- */

  router.post(
    '/tools/preview',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const result = validateToolDefinition(typeof body?.tool === 'object' && body.tool ? body.tool : body);
      if (!result.ok) return c.json({ errors: result.errors }, 400);

      let fish: { ok: true; tool: ReturnType<typeof toFishWebhookTool> } | { ok: false; error: string };
      try {
        fish = { ok: true, tool: toFishWebhookTool(result.tool) };
      } catch (error) {
        fish = { ok: false, error: error instanceof Error ? error.message : 'Fish adapter failed' };
      }

      return c.json({
        canonical: result.tool,
        fish,
        google: toGoogleFunctionDeclaration(result.tool),
        googleOpenApi: toGoogleFunctionDeclaration(result.tool, { schema: 'openapi' }),
        mcp: toMcpToolDescriptor(result.tool),
      });
    },
  );

  router.get(
    '/analytics',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json(await agentService.analytics(c.req.query('agentId') || undefined)),
  );

  router.get(
    '/analytics/dashboard',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const requestedRange = c.req.query('range');
      const requestedChannel = c.req.query('channel');
      const range = isAnalyticsRange(requestedRange) ? requestedRange : '7d';
      const channel = isAnalyticsChannel(requestedChannel) ? requestedChannel : 'all';
      const agentId = c.req.query('agentId') || null;
      return c.json(
        await agentService.analyticsDashboard({
          range,
          agentId,
          channel,
          from: c.req.query('from') || null,
          to: c.req.query('to') || null,
        }),
      );
    },
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

  /* ---------------------------------------------------------------------- */
  /* Model role settings                                                    */
  /* ---------------------------------------------------------------------- */

  const modelRole = (value: string) => (['chat', 'voice', 'call', 'vision'].includes(value) ? (value as 'chat' | 'voice' | 'call' | 'vision') : undefined);

  router.get(
    '/models/roles',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ roles: await agentService.listModelRoleSettings() }),
  );

  router.get(
    '/models/roles/:role',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const role = modelRole(c.req.param('role'));
      if (!role) return badRequest(c, 'role must be chat, voice, call, or vision');
      return c.json({ settings: await agentService.getModelRoleSettings(role) });
    },
  );

  router.put(
    '/models/roles/:role',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const role = modelRole(c.req.param('role'));
      if (!role) return badRequest(c, 'role must be chat, voice, call, or vision');
      const body = await c.req.json().catch(() => ({}));
      const settings = await agentService.updateModelRoleSettings(role, {
        provider: body.provider,
        baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
        apiKey: body.apiKey === null ? null : typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined,
        model: typeof body.model === 'string' ? body.model : undefined,
        fallbackProvider: body.fallbackProvider,
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

  router.get(
    '/',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ agents: (await agentService.listAgentsWithEngagement()).map(publicAgent) }),
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
      return c.json({ agent: publicAgent(agent) }, 201);
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Live engagement — "on a call / chatting right now"                      */
  /* Static routes stay above /:id so "activity" is not captured as an id.   */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/activity',
    policiesMiddleware(CanServer(Action.Retrieve)),
    (c) => c.json({ engagements: agentService.listEngagements() }),
  );

  router.post(
    '/:id/activity',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const kind = body?.kind as AgentEngagementKind;
      if (kind !== 'voice' && kind !== 'chat') return badRequest(c, 'kind must be "voice" or "chat"');
      if (typeof body?.active !== 'boolean') return badRequest(c, 'active must be a boolean');
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const engaged = agentService.reportActivity(agent.id, {
        kind,
        active: body.active,
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
        contact: typeof body.contact === 'string' ? body.contact : null,
      });
      return c.json({ engaged });
    },
  );

  /* ---------------------------------------------------------------------- */
  /* Analytics events — keep static routes above /:id so "events" is not    */
  /* captured as an agent id.                                               */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/events',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const limitParam = c.req.query('limit');
      const limit = limitParam ? Number(limitParam) : undefined;
      return c.json({
        events: await agentService.listEvents({
          agentId: c.req.query('agentId') || undefined,
          conversationId: c.req.query('conversationId') || undefined,
          type: c.req.query('type') || undefined,
          // A non-numeric ?limit= must not smuggle NaN into the store.
          limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
        }),
      });
    },
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

  /* ---------------------------------------------------------------------- */
  /* Chat history + transcripts                                             */
  /* ---------------------------------------------------------------------- */

  router.get(
    '/conversations',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const from = c.req.query('from') || null;
      const to = c.req.query('to') || null;
      const requestedRange = c.req.query('range');
      const range = isAnalyticsRange(requestedRange) ? requestedRange : '7d';
      const window = resolveAnalyticsWindow(range, from, to);
      const requestedStatus = c.req.query('status');
      if (requestedStatus && !['open', 'closing', 'closed'].includes(requestedStatus)) {
        return badRequest(c, 'status must be open, closing or closed');
      }
      const page = Number(c.req.query('page') ?? 1);
      const pageSize = Number(c.req.query('pageSize') ?? 20);
      return c.json(
        await agentService.listConversationSummaries({
          agentId: c.req.query('agentId') || undefined,
          channel: c.req.query('channel') || undefined,
          status: requestedStatus || undefined,
          from: window?.from,
          to: window?.to,
          q: c.req.query('q') || undefined,
          page: Number.isFinite(page) ? page : 1,
          pageSize: Number.isFinite(pageSize) ? pageSize : 20,
        }),
      );
    },
  );

  router.get(
    '/conversations/:id/messages',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const conversation = await agentService.getConversation(c.req.param('id'));
      if (!conversation) return notFound(c, 'Conversation not found');
      const limit = Number(c.req.query('limit') ?? 200);
      return c.json({
        conversation,
        messages: await agentService.listConversationMessages(conversation.id, {
          after: c.req.query('after') || undefined,
          before: c.req.query('before') || undefined,
          limit: Number.isFinite(limit) ? limit : 200,
        }),
      });
    },
  );

  router.post(
    '/conversations/:id/messages',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const conversation = await agentService.getConversation(c.req.param('id'));
      if (!conversation) return notFound(c, 'Conversation not found');
      const body = await c.req.json().catch(() => ({}));
      const role = typeof body.role === 'string' ? body.role : '';
      if (!['customer', 'agent', 'system', 'tool'].includes(role)) {
        return badRequest(c, 'role must be customer, agent, system or tool');
      }
      if (typeof body.text !== 'string' || !body.text.trim()) return badRequest(c, 'text is required');
      const createdAt = typeof body.createdAt === 'string' ? new Date(body.createdAt) : null;
      if (body.createdAt && (!createdAt || Number.isNaN(createdAt.getTime()))) {
        return badRequest(c, 'createdAt must be a valid date');
      }
      const message = await agentService.addConversationMessage({
        conversationId: conversation.id,
        agentId: conversation.agentId,
        userId: typeof body.userId === 'string' ? body.userId : conversation.userId,
        role: role as 'customer' | 'agent' | 'system' | 'tool',
        channel: typeof body.channel === 'string' ? body.channel : conversation.channel,
        text: body.text,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
        createdAt: createdAt?.toISOString(),
      });
      return c.json({ message }, 201);
    },
  );

  router.get(
    '/:id/effective-prompt',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const prompt = await agentService.effectivePrompt(
        c.req.param('id'),
        c.req.query('userId') || undefined,
        c.req.query('query') || undefined,
      );
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

  router.post(
    '/:id/knowledge/upload',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      let body: Record<string, unknown>;
      try {
        body = (await c.req.parseBody()) as Record<string, unknown>;
      } catch {
        return badRequest(c, 'Send the document as multipart/form-data.');
      }
      const file = body.file;
      if (!(file instanceof File)) return badRequest(c, 'A document file is required.');
      const requestedName = typeof body.name === 'string' ? body.name.trim() : '';
      const fallbackName = file.name.replace(/\.[^.]+$/, '').trim() || 'Document';
      try {
        const extracted = await extractDocumentText(file);
        const source = await agentService.addKnowledge(c.req.param('id'), {
          name: requestedName || fallbackName,
          kind: 'file',
          content: extracted.text,
          metadata: extracted.metadata,
        });
        return c.json({ source }, 201);
      } catch (error) {
        return badRequest(c, error instanceof Error ? error.message : 'Could not read the document.');
      }
    },
  );

  router.post(
    '/:id/attachments',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      let body: Record<string, unknown>;
      try {
        body = (await c.req.parseBody()) as Record<string, unknown>;
      } catch {
        return badRequest(c, 'Send the attachment as multipart/form-data.');
      }
      const file = body.file;
      if (!(file instanceof File)) return badRequest(c, 'A document or image file is required.');
      const caption = typeof body.caption === 'string' ? body.caption : '';
      try {
        const attachment = await agentService.readAttachment({
          bytes: new Uint8Array(await file.arrayBuffer()),
          mimetype: file.type,
          filename: file.name,
          caption,
        });
        return c.json({ attachment });
      } catch (error) {
        return badRequest(c, error instanceof Error ? error.message : 'Could not read the attachment.');
      }
    },
  );

  router.get(
    '/:id/knowledge/search',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const query = c.req.query('q') || '';
      if (!query.trim()) return badRequest(c, 'q is required');
      const limit = Number(c.req.query('limit') || '4');
      const hits = await agentService.searchKnowledge(
        c.req.param('id'),
        query,
        Number.isFinite(limit) ? limit : 4,
      );
      return c.json({ hits });
    },
  );

  router.get(
    '/:id/knowledge/:sourceId/chunks',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const chunks = await agentService.listKnowledgeChunks(c.req.param('id'), c.req.param('sourceId'));
      return c.json({ chunks });
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
    '/profiles',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const limit = Number(c.req.query('limit') || 100);
      return c.json({ profiles: await agentService.listUserProfiles(Number.isFinite(limit) ? limit : 100) });
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
      return c.json({ agent: publicAgent(agent) });
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
      return c.json({ mcp: publicAgentMcp(mcp) });
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
      if (body.session === null || body.session === '') delete next.session;
      else if (typeof body.session === 'string') next.session = body.session.trim();
      const updated = await agentService.updateAgent(c.req.param('id'), {
        settings: { ...agent.settings, mcp: next },
      });
      if (!updated) return notFound(c, 'Agent not found');
      return c.json({ mcp: publicAgentMcp((updated.settings?.mcp as Record<string, unknown> | undefined) ?? next) });
    },
  );

  /** Issue a scoped tool key for a live agent. Only the hash is used for auth. */
  router.post(
    '/:id/mcp/key',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const current = (agent.settings?.mcp as Record<string, unknown> | undefined) ?? {};
      const key = `sk_agent_${randomBytes(24).toString('hex')}`;
      const createdAt = new Date().toISOString();
      let ciphertext: string;
      try {
        ciphertext = sealSecret(key);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : 'Could not encrypt the agent key' },
          500,
        );
      }
      const next = {
        ...current,
        apiKeyHash: hashSecret(key),
        apiKeyCiphertext: ciphertext,
        apiKeyPrefix: secretPrefix(key, 14),
        apiKeyCreatedAt: createdAt,
        apiKeyLastUsedAt: null,
      };
      const updated = await agentService.updateAgent(agent.id, {
        settings: { ...agent.settings, mcp: next },
      });
      if (!updated) return notFound(c, 'Agent not found');
      return c.json({ key, prefix: next.apiKeyPrefix, createdAt });
    },
  );

  /** Reveal the stored key to an authenticated admin. */
  router.get(
    '/:id/mcp/key',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const mcp = (agent.settings?.mcp as Record<string, unknown> | undefined) ?? {};
      const ciphertext = typeof mcp.apiKeyCiphertext === 'string' ? mcp.apiKeyCiphertext : '';
      if (!ciphertext) {
        return c.json(
          { error: 'This agent key predates recoverable storage. Regenerate it to enable reveal.' },
          409,
        );
      }
      try {
        return c.json({ key: openSecret(ciphertext), prefix: mcp.apiKeyPrefix ?? null });
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : 'Could not decrypt the agent key' },
          500,
        );
      }
    },
  );

  router.delete(
    '/:id/mcp/key',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const agent = await agentService.getAgent(c.req.param('id'));
      if (!agent) return notFound(c, 'Agent not found');
      const current = (agent.settings?.mcp as Record<string, unknown> | undefined) ?? {};
      const next = { ...current };
      delete next.apiKeyHash;
      delete next.apiKeyCiphertext;
      delete next.apiKeyPrefix;
      delete next.apiKeyCreatedAt;
      delete next.apiKeyLastUsedAt;
      await agentService.updateAgent(agent.id, {
        settings: { ...agent.settings, mcp: next },
      });
      return c.json({ result: true });
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
      return c.json({ agent: publicAgent(agent) });
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

  router.get(
    '/profiles/:userId/facts',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const includeInactive = c.req.query('includeInactive') === '1' || c.req.query('includeInactive') === 'true';
      return c.json({ facts: await agentService.listUserProfileFacts(c.req.param('userId'), includeInactive) });
    },
  );

  router.post(
    '/profiles/:userId/facts',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.key || typeof body.key !== 'string') return badRequest(c, 'key is required');
      const fact = await agentService.createUserProfileFact({
        userId: c.req.param('userId'),
        kind: typeof body.kind === 'string' ? body.kind : 'other',
        key: body.key,
        value: body.value ?? null,
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        source: typeof body.source === 'string' ? body.source : 'manual',
        sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef : null,
        evidence: typeof body.evidence === 'string' ? body.evidence : null,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
        sensitivity: typeof body.sensitivity === 'string' ? body.sensitivity : 'normal',
      });
      return c.json({ fact }, 201);
    },
  );

  router.put(
    '/profiles/:userId/facts/:factId',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      const fact = await agentService.updateUserProfileFact(c.req.param('factId'), {
        kind: typeof body.kind === 'string' ? body.kind : undefined,
        key: typeof body.key === 'string' ? body.key : undefined,
        value: body.value,
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        source: typeof body.source === 'string' ? body.source : undefined,
        sourceRef: typeof body.sourceRef === 'string' ? body.sourceRef : undefined,
        evidence: typeof body.evidence === 'string' ? body.evidence : undefined,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
        sensitivity: typeof body.sensitivity === 'string' ? body.sensitivity : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
      });
      if (!fact) return notFound(c, 'Fact not found');
      return c.json({ fact });
    },
  );

  router.delete(
    '/profiles/:userId/facts/:factId',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const removed = await agentService.deleteUserProfileFact(c.req.param('factId'));
      if (!removed) return notFound(c, 'Fact not found');
      return c.json({ ok: true });
    },
  );

  router.post(
    '/profiles/:userId/extract',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!Array.isArray(body?.messages) || body.messages.length === 0) {
        return badRequest(c, 'messages must be a non-empty array of { role, content }');
      }
      const messages = body.messages
        .filter((message: unknown): message is { role?: unknown; content?: unknown } => Boolean(message) && typeof message === 'object')
        .map((message: { role?: unknown; content?: unknown }) => ({
          role: typeof message.role === 'string' ? message.role : 'user',
          content: typeof message.content === 'string' ? message.content : '',
        }))
        .filter((message: { content: string }) => message.content.trim().length > 0);
      if (messages.length === 0) return badRequest(c, 'messages must contain at least one non-empty content');
      const facts = await agentService.extractUserProfileFacts(c.req.param('userId'), messages);
      return c.json({ facts });
    },
  );

  router.get(
    '/profiles/:userId/context',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => {
      const includeSensitive = c.req.query('includeSensitive') === '1' || c.req.query('includeSensitive') === 'true';
      const context = await agentService.buildProfileContext(c.req.param('userId'), { includeSensitive });
      if (!context) return notFound(c, 'Profile not found');
      return c.json({ context });
    },
  );

  router.get(
    '/profiles/:userId/summary',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ summary: await agentService.getUserProfileSummary(c.req.param('userId')) }),
  );

  router.put(
    '/profiles/:userId/summary',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (typeof body.summary !== 'string') return badRequest(c, 'summary is required');
      const summary = await agentService.upsertUserProfileSummary({
        userId: c.req.param('userId'),
        summary: body.summary,
        model: typeof body.model === 'string' ? body.model : 'manual',
        sourceFactIds: Array.isArray(body.sourceFactIds) ? body.sourceFactIds.map(String) : undefined,
      });
      return c.json({ summary });
    },
  );

  router.post(
    '/profiles/:userId/summarize',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const summary = await agentService.summarizeUserProfile(c.req.param('userId'));
      if (!summary) return notFound(c, 'Profile not found');
      return c.json({ summary });
    },
  );

  router.get(
    '/profiles/:userId/segments',
    policiesMiddleware(CanServer(Action.Retrieve)),
    async (c) => c.json({ segments: await agentService.listUserSegments(c.req.param('userId')) }),
  );

  router.post(
    '/profiles/:userId/segments',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const body = await c.req.json().catch(() => ({}));
      if (!body?.segmentType || typeof body.segmentType !== 'string') return badRequest(c, 'segmentType is required');
      if (!body?.segmentValue || typeof body.segmentValue !== 'string') return badRequest(c, 'segmentValue is required');
      const segment = await agentService.upsertUserSegment({
        userId: c.req.param('userId'),
        segmentType: body.segmentType,
        segmentValue: body.segmentValue,
        score: typeof body.score === 'number' ? body.score : null,
        reason: typeof body.reason === 'string' ? body.reason : '',
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : null,
      });
      return c.json({ segment }, 201);
    },
  );

  router.delete(
    '/profiles/:userId/segments/:segmentId',
    policiesMiddleware(CanServer(Action.Manage)),
    async (c) => {
      const removed = await agentService.deleteUserSegment(c.req.param('segmentId'));
      if (!removed) return notFound(c, 'Segment not found');
      return c.json({ ok: true });
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

  return router;
}

/**
 * SSE stream of live agent-interaction changes, mounted at its own
 * /api/agent-activity prefix — NOT under /api/agents, whose router applies
 * the API-key middleware to every path beneath it and would 401 an
 * EventSource before this handler runs. A browser EventSource cannot send
 * headers, so the stream authenticates with the same single-use ticket as
 * the /ws channel (POST /api/ws/ticket). Each connection receives one
 * `agent.activity` event per change; a keepalive beat every 15 s stops
 * proxies from closing an idle stream. Consumers fall back to their normal
 * polling when no ticket can be had.
 */
export function createAgentsActivityStreamRouter(): Hono {
  const router = new Hono();

  router.get('/stream', async (c) => {
    const ticket = c.req.query('ticket');
    const principal = ticket ? wsTickets.consume(ticket) : null;
    if (!principal) {
      return c.json({ error: 'A ticket from POST /api/ws/ticket is required' }, 401);
    }
    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsubscribe = agentService.onEngagementChange((change) => {
        if (closed) return;
        void stream.writeSSE({ event: 'agent.activity', data: JSON.stringify(change) }).catch(() => {});
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      while (!closed) {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        if (closed) break;
        // EventSource ignores unnamed events; consumers listen for
        // "agent.activity" only, so this beat is invisible to them.
        await stream.writeSSE({ data: 'keepalive' }).catch(() => {});
      }
    });
  });

  return router;
}

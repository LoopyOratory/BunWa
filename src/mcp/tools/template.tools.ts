/**
 * Template MCP tools for BunWa — list, get, create, update, preview, send and
 * delete reusable message templates (REST: /api/sessions/:session/templates).
 * The send tool is the step that lets an agent use a stored template without
 * re-typing its body.
 */
import { z } from 'zod';
import { container } from 'tsyringe';
import type { SessionManager } from '../../core/manager.core';
import type { ToolDescriptor } from '../tool-descriptor';
import { TemplateService } from '../../core/templates/template.service';
import type { Template } from '../../core/templates/template.service';

const sessionId = z.string().min(1).describe('Session name (e.g. "default")');
const templateIdOrName = z.string().min(1)
  .describe('Template id or name (e.g. "welcome-message")');

function svc(): TemplateService {
  return container.resolve(TemplateService);
}

/** Same enrichment the REST list/get routes return: the variables needed. */
function withVariables(service: TemplateService, template: Template) {
  return {
    ...template,
    variables: service.extractVariables(
      [template.header, template.body, template.footer].filter(Boolean).join('\n'),
    ),
  };
}

/** Templates are addressed by id or by name, like the REST routes. */
async function resolveTemplate(
  service: TemplateService,
  session: string,
  idOrName: string,
): Promise<Template> {
  try {
    return await service.resolve(session, { templateId: idOrName });
  } catch {
    return await service.resolve(session, { templateName: idOrName });
  }
}

const variablesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .optional()
  .describe('Values for the {{variables}} in the template');

export function templateTools(manager: SessionManager): ToolDescriptor[] {
  return [
    {
      name: 'TemplateList',
      description:
        'List all message templates for a session, with the {{variables}} each one needs so a caller can render it without a preview round-trip.',
      tier: 'read',
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({ sessionId }),
      handler: async (input) => {
        const service = svc();
        const templates = await service.findBySession(input.sessionId);
        return templates.map((template) => withVariables(service, template));
      },
    },
    {
      name: 'TemplateGet',
      description: 'Get a single message template by id or by name, with the {{variables}} it needs.',
      tier: 'read',
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({ sessionId, template: templateIdOrName }),
      handler: async (input) => {
        const service = svc();
        const template = await resolveTemplate(service, input.sessionId, input.template);
        return withVariables(service, template);
      },
    },
    {
      name: 'TemplateCreate',
      description: 'Create a reusable message template for a session.',
      tier: 'write',
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        name: z.string().min(1).max(100).describe('Template name (unique per session)'),
        body: z.string().min(1).max(4096).describe('Message body, may contain {{variables}}'),
        header: z.string().max(1024).nullable().optional().describe('Optional header line'),
        footer: z.string().max(1024).nullable().optional().describe('Optional footer line'),
      }),
      handler: async (input) => {
        const service = svc();
        const template = await service.create(input.sessionId, {
          name: input.name,
          body: input.body,
          header: input.header ?? null,
          footer: input.footer ?? null,
        });
        return withVariables(service, template);
      },
    },
    {
      name: 'TemplateUpdate',
      description: 'Update a message template by id. Only the fields sent are changed.',
      tier: 'write',
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        templateId: z.string().min(1).describe('Template id to update'),
        name: z.string().min(1).max(100).optional().describe('New name'),
        body: z.string().min(1).max(4096).optional().describe('New body'),
        header: z.string().max(1024).nullable().optional().describe('New header (null clears)'),
        footer: z.string().max(1024).nullable().optional().describe('New footer (null clears)'),
      }),
      handler: async (input) => {
        const service = svc();
        const dto: { name?: string; body?: string; header?: string | null; footer?: string | null } = {};
        if (input.name !== undefined) dto.name = input.name;
        if (input.body !== undefined) dto.body = input.body;
        if (input.header !== undefined) dto.header = input.header;
        if (input.footer !== undefined) dto.footer = input.footer;
        const template = await service.update(input.sessionId, input.templateId, dto);
        return withVariables(service, template);
      },
    },
    {
      name: 'TemplatePreview',
      description:
        'Render a template with variable values without sending anything. Returns the rendered text and the list of variables the template uses.',
      tier: 'read',
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        template: templateIdOrName,
        variables: variablesSchema,
      }),
      handler: async (input) => {
        const service = svc();
        const template = await resolveTemplate(service, input.sessionId, input.template);
        return {
          text: service.preview(template, (input.variables ?? {}) as Record<string, unknown>),
          variables: service.extractVariables(
            [template.header, template.body, template.footer].filter(Boolean).join('\n'),
          ),
          template: { id: template.id, name: template.name },
        };
      },
    },
    {
      name: 'TemplateSend',
      description:
        'Render a template with variable values and send it to a chat. The session must be running. Shapes the outbound message exactly like the REST send-template route.',
      tier: 'write',
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        chatId: z.string().min(1).describe('Chat JID (e.g. 628123456789@c.us or groupId@g.us)'),
        template: templateIdOrName,
        variables: variablesSchema,
        linkPreview: z.boolean().optional().describe('Enable link preview in the sent message'),
      }),
      handler: async (input) => {
        const service = svc();
        const template = await resolveTemplate(service, input.sessionId, input.template);
        const text = service.preview(template, (input.variables ?? {}) as Record<string, unknown>);
        const session = await manager.getWorkingSession(input.sessionId);
        const sent = await (session as any).sendText({
          session: input.sessionId,
          chatId: input.chatId,
          text,
          ...(input.linkPreview !== undefined ? { linkPreview: input.linkPreview } : {}),
        });
        return {
          ...(sent as object),
          template: { id: template.id, name: template.name },
          text,
        };
      },
    },
    {
      name: 'TemplateDelete',
      description: 'Delete a message template by id.',
      tier: 'write',
      destructive: true,
      category: 'template',
      sessionScoped: true,
      inputSchema: z.object({
        sessionId,
        templateId: z.string().min(1).describe('Template id to delete'),
      }),
      handler: async (input) => {
        await svc().delete(input.sessionId, input.templateId);
        return { success: true, templateId: input.templateId };
      },
    },
  ];
}

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'bun:test';
import { container } from 'tsyringe';
import { TemplateService } from '../core/templates/template.service';
import { templateTools } from '../mcp/tools/template.tools';
import type { SessionManager } from '../core/manager.core';
import type { ToolDescriptor } from '../mcp/tool-descriptor';

/**
 * The template MCP tools: contract, plus list/get/preview/send/update/delete
 * behavior against a stubbed TemplateService and a stubbed working session.
 */

const sentRequests: any[] = [];
const runningSession = {
  sendText: async (request: any) => {
    sentRequests.push(request);
    return { id: 'MSG-1' };
  },
};
const fakeManager = {
  getWorkingSession: async (name: string) => {
    if (name !== 'default') throw new Error(`Session '${name}' is not running`);
    return runningSession;
  },
} as unknown as SessionManager;

const baseTemplate = {
  id: 't1',
  sessionId: 'default',
  name: 'welcome',
  body: 'Hi {{name}}, welcome!',
  header: null,
  footer: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const fakeTemplates = {
  async findBySession() {
    return [baseTemplate];
  },
  async resolve(_session: string, ident: { templateId?: string; templateName?: string }) {
    if (ident.templateId === 't1' || ident.templateName === 'welcome') {
      return baseTemplate;
    }
    throw new Error(`Template '${ident.templateId ?? ident.templateName}' not found`);
  },
  async create(sessionId: string, dto: any) {
    return {
      ...baseTemplate,
      id: 't2',
      sessionId,
      name: dto.name,
      body: dto.body,
      header: dto.header ?? null,
      footer: dto.footer ?? null,
    };
  },
  async update(sessionId: string, id: string, dto: any) {
    if (id !== 't1') throw new Error(`Template with id '${id}' not found`);
    return { ...baseTemplate, ...dto };
  },
  async delete() {
    return undefined;
  },
  preview(template: any, variables: any) {
    return template.body.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) =>
      key in variables ? String(variables[key]) : match,
    );
  },
  extractVariables(text: string) {
    return Array.from(text.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);
  },
};

function tool(tools: ToolDescriptor[], name: string): ToolDescriptor {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`Tool ${name} not found`);
  return found;
}

/** Run input through the same zod validation the MCP adapter applies. */
async function call<T = any>(descriptor: ToolDescriptor, input: unknown): Promise<T> {
  const parsed = descriptor.inputSchema.parse(input);
  return (await descriptor.handler(parsed as never)) as T;
}

let tools: ToolDescriptor[];

beforeEach(() => {
  container.registerInstance(TemplateService, fakeTemplates as unknown as TemplateService);
  sentRequests.length = 0;
  tools = templateTools(fakeManager);
});

describe('template MCP tools', () => {
  it('declares the expected contract', () => {
    expect(tools.map((t) => t.name)).toEqual([
      'TemplateList',
      'TemplateGet',
      'TemplateCreate',
      'TemplateUpdate',
      'TemplatePreview',
      'TemplateSend',
      'TemplateDelete',
    ]);
    for (const t of tools) {
      expect(t.sessionScoped).toBe(true);
      expect(t.category).toBe('template');
    }
    expect(tool(tools, 'TemplateList').tier).toBe('read');
    expect(tool(tools, 'TemplatePreview').tier).toBe('read');
    expect(tool(tools, 'TemplateSend').tier).toBe('write');
    expect(tool(tools, 'TemplateDelete').destructive).toBe(true);
  });

  it('TemplateList returns templates enriched with their variables', async () => {
    const list = await call(tool(tools, 'TemplateList'), { sessionId: 'default' });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('t1');
    expect(list[0].variables).toEqual(['name']);
  });

  it('TemplateGet resolves by name', async () => {
    const template = await call(tool(tools, 'TemplateGet'), {
      sessionId: 'default',
      template: 'welcome',
    });
    expect(template.id).toBe('t1');
    expect(template.variables).toEqual(['name']);
  });

  it('TemplatePreview renders without sending', async () => {
    const preview = await call(tool(tools, 'TemplatePreview'), {
      sessionId: 'default',
      template: 't1',
      variables: { name: 'Ama' },
    });
    expect(preview.text).toBe('Hi Ama, welcome!');
    expect(preview.variables).toEqual(['name']);
    expect(sentRequests).toHaveLength(0);
  });

  it('TemplateSend renders and sends through the working session', async () => {
    const result = await call(tool(tools, 'TemplateSend'), {
      sessionId: 'default',
      chatId: '233200000000@c.us',
      template: 'welcome',
      variables: { name: 'Kojo' },
    });
    expect(result.text).toBe('Hi Kojo, welcome!');
    expect(result.template).toEqual({ id: 't1', name: 'welcome' });
    expect(sentRequests).toHaveLength(1);
    expect(sentRequests[0].chatId).toBe('233200000000@c.us');
    expect(sentRequests[0].session).toBe('default');
  });

  it('TemplateUpdate applies only the provided fields', async () => {
    const updated = await call(tool(tools, 'TemplateUpdate'), {
      sessionId: 'default',
      templateId: 't1',
      body: 'Hello {{name}}!',
    });
    expect(updated.body).toBe('Hello {{name}}!');
    expect(updated.name).toBe('welcome');
  });

  it('TemplateCreate passes the fields through', async () => {
    const created = await call(tool(tools, 'TemplateCreate'), {
      sessionId: 'default',
      name: 'order-update',
      body: 'Order {{id}} is on the way',
    });
    expect(created.id).toBe('t2');
    expect(created.name).toBe('order-update');
    expect(created.variables).toEqual(['id']);
  });

  it('TemplateDelete reports success', async () => {
    const result = await call(tool(tools, 'TemplateDelete'), {
      sessionId: 'default',
      templateId: 't1',
    });
    expect(result.success).toBe(true);
  });
});

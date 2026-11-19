import { describe, expect, test } from 'bun:test';
import { toFishWebhookTool } from '../core/tools/fish-tool.adapter';
import { toGoogleFunctionDeclaration, toGoogleOpenApiSchema, toMcpToolDescriptor } from '../core/tools/google-tool.adapter';
import { validateToolDefinition } from '../core/tools/tool-schema';
import type { ToolDefinition } from '../core/tools/tool.types';

function baseTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'create_ticket',
    description: 'Open a support ticket when the issue cannot be resolved in conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', minLength: 1, description: 'One-line summary.' },
        details: { type: 'string', description: 'What the caller reported.' },
        urgency: { type: 'string', enum: ['routine', 'urgent'], default: 'routine' },
      },
      required: ['subject'],
      additionalProperties: false,
    },
    http: {
      method: 'POST',
      url: 'https://api.example.com/tickets',
      contentType: 'application/json',
      bodyTemplate: '{"subject":"{{subject}}","details":"{{details}}"}',
      headers: [{ name: 'X-API-Key', value: 'secret', kind: 'custom' }],
    },
    execution: {
      mode: 'blocking',
      timeoutSeconds: 20,
      errorHandling: 'passthrough',
      preToolSpeech: { mode: 'auto' },
    },
    ...overrides,
  };
}

describe('canonical tool validation', () => {
  test('accepts a cross-provider tool and fills defaults', () => {
    const result = validateToolDefinition(baseTool());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tool.http.contentType).toBe('application/json');
    expect(result.tool.execution.errorHandling).toBe('passthrough');
    expect(result.tool.response).toEqual({ speakField: 'speak', dataField: 'data' });
  });

  test('rejects names and parameters Google and Fish cannot both accept', () => {
    const tool = baseTool({ name: 'create-ticket' });
    const result = validateToolDefinition(tool);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('name must start');
  });

  test('rejects a timeout above the blocking limit', () => {
    const tool = baseTool();
    tool.execution.timeoutSeconds = 180;
    const result = validateToolDefinition(tool);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('1-120');
  });
});

describe('Fish webhook adapter', () => {
  test('maps the canonical tool to the strict Fish payload', () => {
    const result = validateToolDefinition(baseTool());
    if (!result.ok) throw new Error(result.errors.join(' '));
    const payload = toFishWebhookTool(result.tool);

    expect(payload.tool_type).toBe('webhook');
    expect(payload.parameter_mode).toBe('strict');
    expect(payload.execution_mode).toBe('blocking');
    expect(payload.timeout_seconds).toBe(20);
    expect(payload.pre_tool_speech).toEqual({ mode: 'auto' });
    expect(payload.headers).toEqual([{ name: 'X-API-Key', value: 'secret', kind: 'custom' }]);
    expect(payload.parameters.required).toEqual(['subject']);
  });

  test('refuses a URL Fish cannot reach', () => {
    const result = validateToolDefinition(baseTool({ http: { method: 'POST', url: 'http://127.0.0.1:3001/tickets' } }));
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(() => toFishWebhookTool(result.tool)).toThrow(/localhost|private/i);
  });
});

describe('Google adapter', () => {
  test('uses parametersJsonSchema and BLOCKING for state-changing tools', () => {
    const result = validateToolDefinition(baseTool());
    if (!result.ok) throw new Error(result.errors.join(' '));
    const declaration = toGoogleFunctionDeclaration(result.tool);
    expect(declaration.name).toBe('create_ticket');
    expect(declaration.behavior).toBe('BLOCKING');
    expect(declaration.parametersJsonSchema?.required).toEqual(['subject']);
    expect(declaration.responseJsonSchema?.required).toEqual(['ok', 'speak']);
  });

  test('uses NON_BLOCKING for background tools', () => {
    const tool = baseTool();
    tool.execution.mode = 'background';
    tool.execution.timeoutSeconds = 180;
    const result = validateToolDefinition(tool);
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(toGoogleFunctionDeclaration(result.tool).behavior).toBe('NON_BLOCKING');
  });

  test('strips OpenAPI-unsupported keywords in openapi mode', () => {
    const schema = toGoogleOpenApiSchema({
      type: 'object',
      properties: {
        subject: { type: 'string', minLength: 1, pattern: '^[a-z]+$' },
        urgency: { type: ['string', 'null'], enum: ['routine', 'urgent'] },
      },
      required: ['subject'],
      additionalProperties: false,
    });
    expect(schema.properties?.subject.minLength).toBeUndefined();
    expect(schema.properties?.subject.pattern).toBeUndefined();
    expect(schema.properties?.urgency.nullable).toBe(true);
    expect(schema.properties?.urgency.type).toBe('STRING');
  });

  test('keeps the same schema as an MCP descriptor', () => {
    const result = validateToolDefinition(baseTool());
    if (!result.ok) throw new Error(result.errors.join(' '));
    expect(toMcpToolDescriptor(result.tool)).toEqual({
      name: 'create_ticket',
      description: result.tool.description,
      inputSchema: result.tool.inputSchema,
    });
  });
});

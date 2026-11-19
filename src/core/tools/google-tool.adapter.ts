import type {
  GoogleFunctionDeclaration,
  GoogleOpenApiSchema,
  McpToolDescriptor,
  ToolDefinition,
  ToolJsonSchema,
} from './tool.types';

function normalizeType(type: ToolJsonSchema['type']): string | undefined {
  if (typeof type === 'string') return type.toUpperCase();
  if (Array.isArray(type)) {
    const nonNull = type.filter((item) => item !== 'null');
    if (nonNull.length === 1) return String(nonNull[0]).toUpperCase();
    return undefined;
  }
  return undefined;
}

/**
 * Google's `parameters` field is an OpenAPI 3.03 subset. It does not accept
 * every JSON Schema keyword, so strip the ones the model does not understand.
 * The canonical validator still enforces them server-side.
 */
export function toGoogleOpenApiSchema(schema: ToolJsonSchema): GoogleOpenApiSchema {
  const result: GoogleOpenApiSchema = {};
  const type = normalizeType(schema.type);
  if (type) result.type = type;
  if (schema.description) result.description = schema.description;
  if (schema.format) result.format = schema.format;
  if (schema.nullable || (Array.isArray(schema.type) && schema.type.includes('null'))) result.nullable = true;
  if (schema.enum) result.enum = schema.enum;
  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, child]) => [name, toGoogleOpenApiSchema(child)]),
    );
  }
  if (schema.required) result.required = schema.required;
  if (schema.items) result.items = toGoogleOpenApiSchema(schema.items);
  return result;
}

const RESPONSE_ENVELOPE: ToolJsonSchema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'Whether the tool succeeded.' },
    speak: { type: 'string', description: 'A short sentence the voice agent can say.' },
    data: { type: 'object', additionalProperties: true, description: 'Structured result data.' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        retryable: { type: 'boolean' },
      },
      additionalProperties: true,
    },
  },
  required: ['ok', 'speak'],
  additionalProperties: false,
};

/**
 * Maps the canonical definition to a Gemini Live function declaration.
 *
 * `parametersJsonSchema` is the default because it preserves the full schema
 * Fish accepts. Pass `{ schema: 'openapi' }` only for surfaces that reject
 * `parametersJsonSchema`.
 */
export function toGoogleFunctionDeclaration(
  tool: ToolDefinition,
  options: { schema?: 'json' | 'openapi' } = {},
): GoogleFunctionDeclaration {
  const schemaMode = options.schema ?? 'json';
  return {
    name: tool.name,
    description: tool.description,
    ...(schemaMode === 'openapi'
      ? { parameters: toGoogleOpenApiSchema(tool.inputSchema) as unknown as ToolJsonSchema }
      : { parametersJsonSchema: tool.inputSchema }),
    responseJsonSchema: RESPONSE_ENVELOPE,
    behavior: tool.execution.mode === 'blocking' ? 'BLOCKING' : 'NON_BLOCKING',
  };
}

/** The same definition is already an MCP tool; ADK consumes it with McpToolset. */
export function toMcpToolDescriptor(tool: ToolDefinition): McpToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

export const TOOL_RESPONSE_ENVELOPE = RESPONSE_ENVELOPE;

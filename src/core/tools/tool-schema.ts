import type {
  ToolDefinition,
  ToolExecutionMode,
  ToolJsonSchema,
  ToolMethod,
  ToolValidationResult,
} from './tool.types';

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const METHODS: ToolMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const MODES: ToolExecutionMode[] = ['blocking', 'fire_and_forget', 'background'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSchemaType(value: unknown): boolean {
  const allowed = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
  if (typeof value === 'string') return allowed.has(value);
  if (Array.isArray(value)) return value.length > 0 && value.every((item) => typeof item === 'string' && allowed.has(item));
  return false;
}

function validateSchema(schema: unknown, path: string, errors: string[]): void {
  if (!isRecord(schema)) {
    errors.push(`${path} must be a JSON Schema object.`);
    return;
  }
  if (schema.type !== undefined && !isSchemaType(schema.type)) {
    errors.push(`${path}.type must be a JSON Schema type or an array of types.`);
  }
  if (schema.description !== undefined && typeof schema.description !== 'string') {
    errors.push(`${path}.description must be a string.`);
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== 'string')) {
      errors.push(`${path}.required must be an array of parameter names.`);
    } else if (new Set(schema.required).size !== schema.required.length) {
      errors.push(`${path}.required contains duplicate names.`);
    }
  }
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties)) {
      errors.push(`${path}.properties must be an object.`);
    } else {
      for (const [name, child] of Object.entries(schema.properties)) {
        if (!NAME_PATTERN.test(name)) {
          errors.push(`${path}.properties.${name} must start with a letter or underscore and contain only letters, digits, or underscores (max 64).`);
        }
        validateSchema(child, `${path}.properties.${name}`, errors);
      }
      if (Array.isArray(schema.required)) {
        for (const name of schema.required) {
          if (typeof name === 'string' && !(name in schema.properties)) {
            errors.push(`${path}.required names "${name}", but it is not declared in properties.`);
          }
        }
      }
    }
  }
  if (schema.items !== undefined) validateSchema(schema.items, `${path}.items`, errors);
  if (schema.enum !== undefined && !Array.isArray(schema.enum)) {
    errors.push(`${path}.enum must be an array.`);
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    errors.push(`${path}.additionalProperties must be a boolean.`);
  }
  for (const key of ['minimum', 'maximum', 'minLength', 'maxLength'] as const) {
    if (schema[key] !== undefined && typeof schema[key] !== 'number') {
      errors.push(`${path}.${key} must be a number.`);
    }
  }
  if (schema.pattern !== undefined && typeof schema.pattern !== 'string') {
    errors.push(`${path}.pattern must be a string.`);
  }
}

function validateHeaders(headers: unknown, errors: string[]): void {
  if (headers === undefined) return;
  if (!Array.isArray(headers)) {
    errors.push('http.headers must be an array.');
    return;
  }
  for (const [index, header] of headers.entries()) {
    if (!isRecord(header) || typeof header.name !== 'string' || !header.name.trim()) {
      errors.push(`http.headers[${index}].name is required.`);
      continue;
    }
    if (header.value !== undefined && typeof header.value !== 'string') {
      errors.push(`http.headers[${index}].value must be a string.`);
    }
    if (header.kind !== undefined && !['custom', 'authorization_bearer', 'authorization_basic'].includes(String(header.kind))) {
      errors.push(`http.headers[${index}].kind must be custom, authorization_bearer, or authorization_basic.`);
    }
  }
}

/** Validates and fills the defaults both adapters rely on. */
export function validateToolDefinition(input: unknown): ToolValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['tool must be an object.'] };

  if (typeof input.name !== 'string' || !NAME_PATTERN.test(input.name)) {
    errors.push('name must start with a letter or underscore and contain only letters, digits, or underscores (max 64).');
  }
  if (typeof input.description !== 'string' || !input.description.trim()) {
    errors.push('description is required.');
  } else if (input.description.length > 2_000) {
    errors.push('description must be 2,000 characters or fewer.');
  }
  if (!isRecord(input.inputSchema)) {
    errors.push('inputSchema is required and must be a JSON Schema object.');
  } else {
    if (input.inputSchema.type !== 'object') errors.push('inputSchema.type must be "object".');
    validateSchema(input.inputSchema, 'inputSchema', errors);
  }

  const http = isRecord(input.http) ? input.http : null;
  if (!http) {
    errors.push('http is required.');
  } else {
    if (!METHODS.includes(http.method as ToolMethod)) {
      errors.push(`http.method must be one of ${METHODS.join(', ')}.`);
    }
    if (typeof http.url !== 'string' || !http.url.trim()) {
      errors.push('http.url is required.');
    } else {
      try {
        const url = new URL(http.url);
        if (!['http:', 'https:'].includes(url.protocol)) errors.push('http.url must use http or https.');
      } catch {
        errors.push('http.url must be a valid URL.');
      }
    }
    if (http.contentType !== undefined && typeof http.contentType !== 'string') {
      errors.push('http.contentType must be a string.');
    }
    if (http.bodyTemplate !== undefined) {
      if (typeof http.bodyTemplate !== 'string') errors.push('http.bodyTemplate must be a string.');
      else if (http.bodyTemplate.length > 100_000) errors.push('http.bodyTemplate must be 100,000 characters or fewer.');
    }
    validateHeaders(http.headers, errors);
  }

  const execution = isRecord(input.execution) ? input.execution : {};
  const mode = (execution.mode ?? 'blocking') as ToolExecutionMode;
  if (!MODES.includes(mode)) errors.push(`execution.mode must be one of ${MODES.join(', ')}.`);
  const timeoutValue = execution.timeoutSeconds;
  const timeout = typeof timeoutValue === 'number' ? timeoutValue : 30;
  if (typeof timeoutValue !== 'number' || !Number.isFinite(timeoutValue) || timeoutValue < 1 || timeoutValue > (mode === 'background' ? 300 : 120)) {
    errors.push(`execution.timeoutSeconds must be 1-${mode === 'background' ? 300 : 120}.`);
  }
  if (execution.errorHandling !== undefined && !['passthrough', 'hide'].includes(String(execution.errorHandling))) {
    errors.push('execution.errorHandling must be passthrough or hide.');
  }
  const speech = isRecord(execution.preToolSpeech) ? execution.preToolSpeech : { mode: 'auto' };
  if (!['auto', 'off', 'static'].includes(String(speech.mode))) {
    errors.push('execution.preToolSpeech.mode must be auto, off, or static.');
  }
  if (speech.mode === 'static' && (typeof speech.message !== 'string' || !speech.message.trim())) {
    errors.push('execution.preToolSpeech.message is required when mode is static.');
  }
  if (typeof speech.message === 'string' && speech.message.length > 500) {
    errors.push('execution.preToolSpeech.message must be 500 characters or fewer.');
  }

  if (errors.length > 0) return { ok: false, errors };

  const tool: ToolDefinition = {
    name: String(input.name),
    description: String(input.description).trim(),
    inputSchema: input.inputSchema as ToolJsonSchema,
    http: {
      method: http!.method as ToolMethod,
      url: String(http!.url),
      contentType: typeof http!.contentType === 'string' ? http!.contentType : 'application/json',
      bodyTemplate: typeof http!.bodyTemplate === 'string' ? http!.bodyTemplate : '',
      headers: Array.isArray(http!.headers) ? (http!.headers as ToolDefinition['http']['headers']) : [],
    },
    execution: {
      mode,
      timeoutSeconds: timeout,
      errorHandling: execution.errorHandling === 'hide' ? 'hide' : 'passthrough',
      preToolSpeech: {
        mode: speech.mode as 'auto' | 'off' | 'static',
        ...(typeof speech.message === 'string' ? { message: speech.message } : {}),
      },
    },
    response: isRecord(input.response)
      ? {
          speakField: typeof input.response.speakField === 'string' ? input.response.speakField : 'speak',
          dataField: typeof input.response.dataField === 'string' ? input.response.dataField : 'data',
        }
      : { speakField: 'speak', dataField: 'data' },
    annotations: isRecord(input.annotations)
      ? {
          readOnly: Boolean(input.annotations.readOnly),
          destructive: Boolean(input.annotations.destructive),
          idempotent: Boolean(input.annotations.idempotent),
        }
      : { readOnly: false, destructive: false, idempotent: true },
    mocks: Array.isArray(input.mocks)
      ? (input.mocks as ToolDefinition['mocks'])
      : [],
  };

  return { ok: true, tool };
}

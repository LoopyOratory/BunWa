/**
 * Canonical tool definition shared by Fish webhook tools and Google function
 * declarations. The same object drives both adapters; provider-specific
 * fields are generated, never hand-written twice.
 */

export type ToolMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ToolExecutionMode = 'blocking' | 'fire_and_forget' | 'background';
export type ToolErrorHandling = 'passthrough' | 'hide';
export type ToolPreSpeechMode = 'auto' | 'off' | 'static';
export type ToolHeaderKind = 'custom' | 'authorization_bearer' | 'authorization_basic';

export interface ToolJsonSchema {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null' | Array<'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'>;
  description?: string;
  properties?: Record<string, ToolJsonSchema>;
  required?: string[];
  items?: ToolJsonSchema;
  enum?: Array<string | number | boolean | null>;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean;
  nullable?: boolean;
  format?: string;
  [key: string]: unknown;
}

export interface ToolHeader {
  name: string;
  value?: string;
  kind?: ToolHeaderKind;
}

export interface ToolHttpConfig {
  method: ToolMethod;
  url: string;
  contentType?: string;
  bodyTemplate?: string;
  headers?: ToolHeader[];
}

export interface ToolPreSpeech {
  mode: ToolPreSpeechMode;
  message?: string;
}

export interface ToolExecution {
  mode: ToolExecutionMode;
  timeoutSeconds?: number;
  preToolSpeech?: ToolPreSpeech;
  errorHandling?: ToolErrorHandling;
}

export interface ToolMockResponse {
  name?: string;
  statusCode?: number;
  contentType?: string;
  body: string;
}

export interface ToolResponseConfig {
  /** Field in the endpoint response that the voice model should speak. */
  speakField?: string;
  /** Field that carries structured data for the model. */
  dataField?: string;
}

export interface ToolAnnotations {
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolJsonSchema;
  http: ToolHttpConfig;
  execution: ToolExecution;
  response?: ToolResponseConfig;
  annotations?: ToolAnnotations;
  mocks?: ToolMockResponse[];
}

export interface ToolValidationSuccess {
  ok: true;
  tool: ToolDefinition;
}

export interface ToolValidationFailure {
  ok: false;
  errors: string[];
}

export type ToolValidationResult = ToolValidationSuccess | ToolValidationFailure;

export interface FishWebhookToolPayload {
  tool_type: 'webhook';
  name: string;
  description: string;
  parameters: ToolJsonSchema;
  parameter_mode: 'strict';
  method: ToolMethod;
  url: string;
  content_type: string;
  body_template: string;
  headers: Array<{ name: string; value?: string; kind: ToolHeaderKind }>;
  timeout_seconds: number;
  error_handling: ToolErrorHandling;
  execution_mode: ToolExecutionMode;
  pre_tool_speech: ToolPreSpeech;
  mock_responses: Array<{ name?: string; status_code?: number; content_type?: string; body: string }>;
}

export interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema?: ToolJsonSchema;
  parameters?: ToolJsonSchema;
  responseJsonSchema?: ToolJsonSchema;
  behavior: 'BLOCKING' | 'NON_BLOCKING';
}

export interface GoogleOpenApiSchema {
  type?: string;
  description?: string;
  properties?: Record<string, GoogleOpenApiSchema>;
  required?: string[];
  items?: GoogleOpenApiSchema;
  enum?: Array<string | number | boolean | null>;
  nullable?: boolean;
  format?: string;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: ToolJsonSchema;
}

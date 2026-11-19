import type { FishWebhookToolPayload, ToolDefinition, ToolHeaderKind } from './tool.types';

const BLOCKED_SUFFIXES = ['.local', '.internal', '.svc', '.arpa'];

export function isBlockedFishHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === 'localhost.localdomain' || host === '0.0.0.0' || host === '::1' || host === '::') return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return true;
  if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return true;
  const match = host.match(/^172\.(\d{1,3})\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  return false;
}

/**
 * Fish's hosted runtime rejects localhost, private ranges and metadata
 * endpoints. Catch that before a tool is created, with a message the admin can
 * act on instead of a remote validation error.
 */
export function assertFishReachableUrl(value: string): void {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Fish webhook tools must use http or https.');
  }
  if (isBlockedFishHost(url.hostname)) {
    throw new Error(
      'Fish Audio cannot call localhost, private network ranges, or metadata endpoints. Use a public HTTPS URL (a tunnel is fine for testing).',
    );
  }
}

/** Maps the canonical definition to Fish's workspace webhook-tool payload. */
export function toFishWebhookTool(tool: ToolDefinition): FishWebhookToolPayload {
  assertFishReachableUrl(tool.http.url);

  const headers = (tool.http.headers ?? []).map((header) => ({
    name: header.name,
    ...(header.value !== undefined ? { value: header.value } : {}),
    kind: (header.kind ?? 'custom') as ToolHeaderKind,
  }));

  return {
    tool_type: 'webhook',
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    parameter_mode: 'strict',
    method: tool.http.method,
    url: tool.http.url,
    content_type: tool.http.contentType ?? 'application/json',
    body_template: tool.http.bodyTemplate ?? '',
    headers,
    timeout_seconds: tool.execution.timeoutSeconds ?? 30,
    error_handling: tool.execution.errorHandling ?? 'passthrough',
    execution_mode: tool.execution.mode,
    pre_tool_speech: {
      mode: tool.execution.preToolSpeech?.mode ?? 'auto',
      ...(tool.execution.preToolSpeech?.message ? { message: tool.execution.preToolSpeech.message } : {}),
    },
    mock_responses: (tool.mocks ?? []).map((mock) => ({
      ...(mock.name ? { name: mock.name } : {}),
      ...(mock.statusCode !== undefined ? { status_code: mock.statusCode } : {}),
      ...(mock.contentType ? { content_type: mock.contentType } : {}),
      body: mock.body,
    })),
  };
}

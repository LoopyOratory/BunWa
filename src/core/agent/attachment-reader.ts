/**
 * Attachment understanding for agents.
 *
 * WhatsApp customers send two things an agent must actually read: documents
 * (PDF, DOCX, text) and images (receipts, screenshots, product photos). This
 * module turns either into plain text the model can use:
 *
 * - documents are extracted locally with unpdf/mammoth;
 * - images are normalised with sharp and sent to a vision model.
 *
 * It is deliberately independent of WhatsApp and of the agent store. The
 * caller supplies bytes plus the vision settings, which keeps it testable and
 * lets the same code serve an API upload, an MCP tool, or a future chat runtime.
 */
import sharp from 'sharp';
import { extractDocumentText, MAX_KNOWLEDGE_FILE_BYTES } from '../knowledge/extract';
import type { ModelProviderType, VisionSettings } from './agent.types';

export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;
export const MAX_ATTACHMENT_TEXT_CHARS = 24_000;
const VISION_TIMEOUT_MS = 60_000;
// DeepSeek v4.x and other reasoning models spend part of every budget on
// reasoning before the visible answer; 1400 truncated real photos.
const VISION_MAX_TOKENS = 3_000;
const IMAGE_MAX_EDGE = 1_800;

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export type AttachmentKind = 'document' | 'image';

export interface AttachmentInput {
  bytes: Uint8Array;
  mimetype?: string | null;
  filename?: string | null;
  /** WhatsApp caption, if the sender included one. */
  caption?: string | null;
}

export interface AttachmentImageInfo {
  width: number | null;
  height: number | null;
  format: string | null;
  model: string;
}

export interface AttachmentResult {
  kind: AttachmentKind;
  filename: string;
  mimetype: string;
  sizeBytes: number;
  /** Extracted document text, or the vision model's description of an image. */
  text: string;
  truncated: boolean;
  image?: AttachmentImageInfo;
  metadata: Record<string, unknown>;
}

export interface AttachmentReaderOptions {
  settings: VisionSettings;
  maxChars?: number;
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const IMAGE_PROMPT = `You read images for a WhatsApp business agent. Return plain text only, no markdown.

1. Say briefly what the image is (receipt, invoice, product photo, screenshot, ID, handwritten note, etc.).
2. Transcribe every piece of visible text exactly, including numbers, amounts, dates, phone numbers, order IDs, and names. Preserve line breaks where they matter.
3. If it is a receipt, invoice, order, payment confirmation, delivery note, or product label, list the key fields one per line as "Field: value".
4. If part of the image is unreadable, say which part instead of guessing.
5. Do not invent details that are not visible.`;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function isImage(input: AttachmentInput): boolean {
  const mime = (input.mimetype ?? '').toLowerCase().split(';')[0].trim();
  if (IMAGE_MIME_TYPES.has(mime)) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(input.filename ?? ''));
}

function safeFilename(input: AttachmentInput, kind: AttachmentKind): string {
  const name = (input.filename ?? '').trim();
  if (name) return name;
  return kind === 'image' ? 'image' : 'document';
}

function normalizeUrl(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('The vision model has no base URL. Set it in model settings.');
  return `${base}${path}`;
}

function anthropicMessagesUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return 'https://api.anthropic.com/v1/messages';
  return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
}

function providerName(provider: ModelProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic';
    case 'google':
      return 'Google';
    case 'openai-compatible':
      return 'the OpenAI-compatible provider';
    default:
      return provider;
  }
}

function visionEndpoint(settings: VisionSettings, served: 'primary' | 'fallback') {
  if (served === 'primary') {
    return {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
    };
  }
  return {
    provider: settings.fallbackProvider,
    baseUrl: settings.fallbackBaseUrl,
    apiKey: settings.fallbackApiKey,
    model: settings.fallbackModel,
  };
}

function requireEndpoint(
  endpoint: ReturnType<typeof visionEndpoint>,
  served: 'primary' | 'fallback',
): asserts endpoint is { provider: ModelProviderType; baseUrl: string; apiKey: string; model: string } {
  const label = served === 'primary' ? 'vision model' : 'fallback vision model';
  if (!endpoint.model.trim()) {
    throw new Error(`No ${label} is set. Add one in model settings.`);
  }
  if (!endpoint.baseUrl.trim()) {
    throw new Error(`The ${label} has no base URL. Add one in model settings.`);
  }
  if (!endpoint.apiKey) {
    throw new Error(`The ${label} has no API key. Add one in model settings.`);
  }
  if (endpoint.provider !== 'openai-compatible' && endpoint.provider !== 'anthropic' && endpoint.provider !== 'google') {
    throw new Error(`${providerName(endpoint.provider)} is not a vision provider. Choose an OpenAI-compatible, Anthropic, or Google model.`);
  }
}

async function callOpenAiCompatible(
  endpoint: { baseUrl: string; apiKey: string; model: string },
  prompt: string,
  dataUrl: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(normalizeUrl(endpoint.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${endpoint.apiKey}`,
      // OpenCode Go routes by session; without this header every image
      // analysis through it answers 400 MissingSessionID.
      ...(endpoint.baseUrl.includes('opencode.ai') ? { 'x-opencode-session': 'bunwa-vision' } : {}),
    },
    body: JSON.stringify({
      model: endpoint.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: VISION_MAX_TOKENS,
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string; reasoning_content?: string } }[];
  } | null;
  const message = body?.choices?.[0]?.message;
  // Reasoning models (DeepSeek v4.x on OpenCode) can spend the whole budget on
  // reasoning and leave `content` empty while the useful description sits in
  // `reasoning_content`. Prefer the visible answer, but never return nothing.
  return message?.content?.trim() || message?.reasoning_content?.trim() || '';
}

async function callAnthropic(
  endpoint: { baseUrl: string; apiKey: string; model: string },
  prompt: string,
  mediaType: string,
  base64: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = await fetchImpl(anthropicMessagesUrl(endpoint.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': endpoint.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: endpoint.model,
      max_tokens: VISION_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await response.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
  } | null;
  return body?.content?.find((part) => part.type === 'text')?.text?.trim() ?? '';
}

async function callGoogle(
  endpoint: { baseUrl: string; apiKey: string; model: string },
  prompt: string,
  mediaType: string,
  base64: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<string> {
  const model = endpoint.model.replace(/^models\//, '');
  const response = await fetchImpl(
    `${normalizeUrl(endpoint.baseUrl, `/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(endpoint.apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inline_data: { mime_type: mediaType, data: base64 } }],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: VISION_MAX_TOKENS },
      }),
      signal,
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  return body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
}

async function describeImage(
  settings: VisionSettings,
  prompt: string,
  mediaType: string,
  base64: string,
  options: { timeoutMs: number; fetchImpl: typeof fetch },
): Promise<{ text: string; model: string }> {
  const dataUrl = `data:${mediaType};base64,${base64}`;
  const attempts: Array<'primary' | 'fallback'> = ['primary'];
  if (settings.fallbackModel.trim()) attempts.push('fallback');

  let lastError: unknown;
  for (const served of attempts) {
    const endpoint = visionEndpoint(settings, served);
    try {
      requireEndpoint(endpoint, served);
      const signal = AbortSignal.timeout(options.timeoutMs);
      const text =
        endpoint.provider === 'anthropic'
          ? await callAnthropic(endpoint, prompt, mediaType, base64, signal, options.fetchImpl)
          : endpoint.provider === 'google'
            ? await callGoogle(endpoint, prompt, mediaType, base64, signal, options.fetchImpl)
            : await callOpenAiCompatible(endpoint, prompt, dataUrl, signal, options.fetchImpl);
      if (text.trim()) return { text: text.trim(), model: endpoint.model };
      lastError = new Error('The vision model returned no description.');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n\n[Truncated at ${maxChars.toLocaleString()} characters.]`,
    truncated: true,
  };
}

/**
 * Read one attachment. Documents are extracted locally; images are described by
 * the configured vision model. Throws a plain-language error when the type is
 * unsupported, the file is too large, or the model is not configured.
 */
export async function readAttachment(
  input: AttachmentInput,
  options: AttachmentReaderOptions,
): Promise<AttachmentResult> {
  if (!input.bytes?.length) throw new Error('The attachment is empty.');
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`The attachment is too large (${input.bytes.length} bytes). Keep it under ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`);
  }

  const image = isImage(input);
  const kind: AttachmentKind = image ? 'image' : 'document';
  const filename = safeFilename(input, kind);
  const mimetype = (input.mimetype ?? (image ? 'image/jpeg' : 'application/octet-stream')).split(';')[0].trim();

  if (image) {
    let normalized: Buffer;
    let info: { width?: number; height?: number; format?: string };
    try {
      const result = await sharp(Buffer.from(input.bytes))
        .rotate()
        .resize({ width: IMAGE_MAX_EDGE, height: IMAGE_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      normalized = result.data;
      info = result.info;
    } catch {
      throw new Error('This image could not be read. Send a JPEG, PNG, WEBP, or GIF image.');
    }

    const prompt = input.caption?.trim()
      ? `${IMAGE_PROMPT}\n\nThe sender attached this caption: "${input.caption.trim().slice(0, 500)}"`
      : IMAGE_PROMPT;
    const described = await describeImage(options.settings, prompt, 'image/jpeg', normalized.toString('base64'), {
      timeoutMs: options.timeoutMs ?? VISION_TIMEOUT_MS,
      fetchImpl: options.fetchImpl ?? fetch,
    });
    const limited = truncateText(described.text, options.maxChars ?? MAX_ATTACHMENT_TEXT_CHARS);
    return {
      kind: 'image',
      filename,
      mimetype,
      sizeBytes: input.bytes.length,
      text: limited.text,
      truncated: limited.truncated,
      image: {
        width: info.width ?? null,
        height: info.height ?? null,
        format: info.format ?? null,
        model: described.model,
      },
      metadata: {
        originalMimeType: mimetype,
        normalizedMimeType: 'image/jpeg',
        caption: input.caption?.trim() || null,
      },
    };
  }

  if (input.bytes.length > MAX_KNOWLEDGE_FILE_BYTES) {
    throw new Error(`The document is too large. Keep it under ${MAX_KNOWLEDGE_FILE_BYTES / 1024 / 1024} MB.`);
  }

  const file = new File([input.bytes], filename, { type: mimetype });
  const extracted = await extractDocumentText(file);
  const limited = truncateText(extracted.text, options.maxChars ?? MAX_ATTACHMENT_TEXT_CHARS);
  return {
    kind: 'document',
    filename,
    mimetype: extracted.metadata.mimeType,
    sizeBytes: input.bytes.length,
    text: limited.text,
    truncated: limited.truncated,
    metadata: {
      ...extracted.metadata,
      caption: input.caption?.trim() || null,
    },
  };
}

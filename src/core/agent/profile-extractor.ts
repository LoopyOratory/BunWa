import type { ModelSettingsSecrets, ProfileFactKind, ProfileFactSensitivity, UserProfileFact } from './agent.types';

const TIMEOUT_MS = 45_000;
const MAX_MESSAGES = 40;
const MAX_CHARS = 12_000;

export interface ProfileMessage {
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
}

export interface ExtractedProfileFact {
  kind: ProfileFactKind;
  key: string;
  value: unknown;
  confidence: number;
  evidence: string | null;
  sensitivity: ProfileFactSensitivity;
}

const KINDS: ProfileFactKind[] = ['identity', 'preference', 'constraint', 'goal', 'relationship', 'communication', 'other'];
const SENSITIVITIES: ProfileFactSensitivity[] = ['normal', 'personal', 'sensitive'];

function normalizeUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}${path}`;
}

function existingFactsBlock(facts: UserProfileFact[]): string {
  if (facts.length === 0) return 'None.';
  return facts
    .map((fact) => `- ${fact.kind}/${fact.key}: ${JSON.stringify(fact.value)} (confidence ${fact.confidence.toFixed(2)})`)
    .join('\n');
}

function conversationBlock(messages: ProfileMessage[]): string {
  const usable = messages
    .filter((message) => typeof message.content === 'string' && message.content.trim())
    .slice(-MAX_MESSAGES);
  let text = usable.map((message) => `${message.role}: ${message.content.trim()}`).join('\n');
  if (text.length > MAX_CHARS) text = text.slice(-MAX_CHARS);
  return text;
}

function systemPrompt(): string {
  return `You extract durable, decision-relevant facts about a person from a conversation so a support agent can serve them better.

Rules:
- Only extract facts that change how an agent should reply or act.
- Prefer stable traits, preferences, constraints, goals, relationships, and communication style.
- Do not infer sensitive traits (health, religion, ethnicity, politics, sexual orientation, precise finances) unless the person stated them explicitly and they are necessary for the task.
- Do not duplicate an existing fact. If a new fact contradicts an existing one, return the new fact with higher confidence.
- Every fact must have a short snake_case key, a concrete value, a confidence from 0 to 1, and a short evidence quote or paraphrase.
- Keep the set small: at most 8 facts per conversation.
- Return a JSON array only, with objects shaped like:
  {"kind":"preference|constraint|goal|relationship|communication|identity|other","key":"short_key","value":"...","confidence":0.8,"evidence":"...","sensitivity":"normal|personal|sensitive"}`;
}

function userPrompt(existing: UserProfileFact[], messages: ProfileMessage[]): string {
  return `Existing facts:\n${existingFactsBlock(existing)}\n\nConversation:\n${conversationBlock(messages)}\n\nReturn the JSON array now.`;
}

async function callOpenAiCompatible(settings: ModelSettingsSecrets, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (!settings.baseUrl.trim()) throw new Error('Base URL is empty. Set the chat model provider in model settings.');
  if (!settings.apiKey) throw new Error('API key is missing. Add the chat provider key in model settings.');
  const response = await fetch(normalizeUrl(settings.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 1_200,
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return body?.choices?.[0]?.message?.content?.trim() ?? '';
}

async function callAnthropic(settings: ModelSettingsSecrets, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (!settings.apiKey) throw new Error('API key is missing. Add the chat provider key in model settings.');
  const base = settings.baseUrl.trim() || 'https://api.anthropic.com';
  const response = await fetch(normalizeUrl(base, '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1_200,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const body = (await response.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
  return body?.content?.find((part) => part.type === 'text')?.text?.trim() ?? '';
}

async function callGoogle(settings: ModelSettingsSecrets, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (!settings.apiKey) throw new Error('API key is missing. Add the Google provider key in model settings.');
  const base = settings.baseUrl.trim() || 'https://generativelanguage.googleapis.com/v1beta';
  const model = settings.model.replace(/^models\//, '');
  const response = await fetch(
    `${normalizeUrl(base, `/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1_200 },
      }),
      signal,
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${detail.slice(0, 240)}`);
  }
  const body = (await response.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  return body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
}

export function parseExtractedFacts(raw: string): ExtractedProfileFact[] {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const facts: ExtractedProfileFact[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const kind = typeof record.kind === 'string' && KINDS.includes(record.kind as ProfileFactKind) ? (record.kind as ProfileFactKind) : 'other';
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    if (!key) continue;
    const value = record.value ?? null;
    if (value === null || value === '') continue;
    const confidence = typeof record.confidence === 'number' && Number.isFinite(record.confidence) ? Math.max(0, Math.min(1, record.confidence)) : 0.7;
    const sensitivity =
      typeof record.sensitivity === 'string' && SENSITIVITIES.includes(record.sensitivity as ProfileFactSensitivity)
        ? (record.sensitivity as ProfileFactSensitivity)
        : 'normal';
    const evidence = typeof record.evidence === 'string' ? record.evidence.slice(0, 500) : null;
    facts.push({ kind, key, value, confidence, evidence, sensitivity });
  }
  return facts.slice(0, 8);
}

async function callModel(settings: ModelSettingsSecrets, system: string, user: string, signal: AbortSignal): Promise<string> {
  if (!settings.model.trim()) throw new Error('No chat model is set. Configure a chat model in model settings.');
  switch (settings.provider) {
    case 'anthropic':
      return callAnthropic(settings, system, user, signal);
    case 'google':
      return callGoogle(settings, system, user, signal);
    case 'openai-compatible':
      return callOpenAiCompatible(settings, system, user, signal);
    default:
      throw new Error(`Profile extraction needs a chat model. ${settings.provider} is not a chat provider.`);
  }
}

/**
 * Extracts a small set of durable profile facts from a conversation.
 * Uses the configured chat model, then the configured fallback model.
 */
export async function extractProfileFacts(
  settings: ModelSettingsSecrets,
  existing: UserProfileFact[],
  messages: ProfileMessage[],
): Promise<ExtractedProfileFact[]> {
  const system = systemPrompt();
  const user = userPrompt(existing, messages);
  const primary = await callModel(settings, system, user, AbortSignal.timeout(TIMEOUT_MS)).catch((error) => {
    if (!settings.fallbackModel.trim()) throw error;
    return null;
  });
  if (primary !== null) return parseExtractedFacts(primary);

  const fallbackSettings: ModelSettingsSecrets = {
    ...settings,
    provider: settings.fallbackProvider,
    baseUrl: settings.fallbackBaseUrl,
    apiKey: settings.fallbackApiKey,
    model: settings.fallbackModel,
  };
  const fallback = await callModel(fallbackSettings, system, user, AbortSignal.timeout(TIMEOUT_MS));
  return parseExtractedFacts(fallback);
}

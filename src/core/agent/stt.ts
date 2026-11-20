/**
 * Speech-to-text for inbound WhatsApp voice notes (chat runtime).
 *
 * Configured like every other model role: `stt` with an OpenAI-compatible
 * provider — POST {baseUrl}/audio/transcriptions with the audio file. Env
 * fallbacks (BUNWA_STT_BASE_URL / _API_KEY / _MODEL) keep a single-provider
 * install working without touching the dashboard.
 */

import { agentService } from './agent.service';

const STT_TIMEOUT_MS = 60_000;

export interface TranscriptionInput {
  bytes: Buffer;
  mimetype: string;
  /** ISO language hint, optional. */
  language?: string;
}

export async function transcribeAudio(input: TranscriptionInput): Promise<string | null> {
  const settings = await agentService
    .getModelRoleSettingsSecrets('stt')
    .catch(() => null);
  const baseUrl = settings?.baseUrl?.trim() || process.env.BUNWA_STT_BASE_URL?.trim() || '';
  const apiKey = settings?.apiKey?.trim() || process.env.BUNWA_STT_API_KEY?.trim() || '';
  const model = settings?.model?.trim() || process.env.BUNWA_STT_MODEL?.trim() || '';
  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`;
  const form = new FormData();
  const extension = input.mimetype.includes('ogg')
    ? 'ogg'
    : input.mimetype.includes('mp4') || input.mimetype.includes('m4a')
      ? 'm4a'
      : input.mimetype.includes('webm')
        ? 'webm'
        : 'mp3';
  form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimetype }), `voice-note.${extension}`);
  form.append('model', model);
  if (input.language) form.append('language', input.language);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`stt: ${model} -> HTTP ${response.status}`);
      return null;
    }
    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim();
    return text || null;
  } catch (error) {
    console.warn(`stt: transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

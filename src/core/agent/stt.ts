/**
 * Speech-to-text for inbound WhatsApp voice notes (chat runtime).
 *
 * Configured like every other model role: `stt` with an OpenAI-compatible
 * provider — POST {baseUrl}/audio/transcriptions with the audio file. Env
 * fallbacks (BUNWA_STT_BASE_URL / _API_KEY / _MODEL) keep a single-provider
 * install working without touching the dashboard.
 *
 * When the primary provider fails (a rate-limited key answers 429, whisper is
 * down), transcription falls back to Gemini chat completions with inline WAV
 * audio, using GEMINI_API_KEY or the vision role's stored key. The audio is
 * converted to 16 kHz mono WAV with ffmpeg first — the same binary sendVoice
 * already depends on — because Gemini's inline path is unreliable with ogg.
 */

import { agentService } from './agent.service';

const STT_TIMEOUT_MS = 60_000;
const GEMINI_STT_MODEL = process.env.BUNWA_STT_GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

export interface TranscriptionInput {
  bytes: Buffer;
  mimetype: string;
  /** ISO language hint, optional. */
  language?: string;
}

/** Injectable seams so tests never touch the network or ffmpeg. */
export interface TranscribeDeps {
  fetchImpl?: typeof fetch;
  /** Defaults to spawning ffmpeg; tests replace it. */
  toWav?: (bytes: Buffer) => Promise<Buffer>;
}

async function getGeminiApiKey(): Promise<string> {
  const fromEnv = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const vision = await agentService.getModelRoleSettingsSecrets('vision').catch(() => null);
  return vision?.apiKey?.trim() || '';
}

async function ffmpegToWav(bytes: Buffer): Promise<Buffer> {
  const proc = Bun.spawn(
    ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  );
  proc.stdin.write(bytes);
  await proc.stdin.end();
  const [out, err] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`ffmpeg failed (${code}): ${err.slice(0, 200)}`);
  }
  return Buffer.from(out);
}

async function transcribeViaGemini(
  input: TranscriptionInput,
  apiKey: string,
  deps: TranscribeDeps,
): Promise<string | null> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const toWav = deps.toWav ?? ffmpegToWav;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const wav = await toWav(input.bytes);
    const response = await fetchImpl(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GEMINI_STT_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe this audio verbatim. Reply with the transcription only.' },
              { type: 'input_audio', input_audio: { data: wav.toString('base64'), format: 'wav' } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`stt: ${GEMINI_STT_MODEL} fallback -> HTTP ${response.status}`);
      return null;
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || null;
  } catch (error) {
    console.warn(`stt: gemini fallback failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function transcribeAudio(input: TranscriptionInput, deps: TranscribeDeps = {}): Promise<string | null> {
  const settings = await agentService
    .getModelRoleSettingsSecrets('stt')
    .catch(() => null);
  const baseUrl = settings?.baseUrl?.trim() || process.env.BUNWA_STT_BASE_URL?.trim() || '';
  const apiKey = settings?.apiKey?.trim() || process.env.BUNWA_STT_API_KEY?.trim() || '';
  const model = settings?.model?.trim() || process.env.BUNWA_STT_MODEL?.trim() || '';

  if (baseUrl && apiKey && model) {
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
      const fetchImpl = deps.fetchImpl ?? fetch;
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
      if (response.ok) {
        const data = (await response.json()) as { text?: string };
        const text = data.text?.trim();
        if (text) return text;
      } else {
        console.warn(`stt: ${model} -> HTTP ${response.status}`);
      }
    } catch (error) {
      console.warn(`stt: transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // Primary missing or failed — the fallback still gives the customer an answer.
  const geminiKey = await getGeminiApiKey();
  if (!geminiKey) return null;
  return transcribeViaGemini(input, geminiKey, deps);
}

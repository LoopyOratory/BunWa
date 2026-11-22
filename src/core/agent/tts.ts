/**
 * Text-to-speech for the chat runtime's voice-note replies.
 *
 * Fish Audio is the platform default (the same engine the calls use): the
 * `voice` model role with provider `fish` carries the API key and the
 * reference voice id. Env fallbacks (FISH_API_KEY / FISH_AGENT_ID) keep a
 * single-voice install working without dashboard configuration.
 *
 * Returns MP3 bytes; the engines' sendVoice(convert: true) turns them into
 * a WhatsApp voice note (ogg/opus).
 */

import { agentService } from './agent.service';

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';
const TTS_TIMEOUT_MS = 60_000;

export async function synthesizeSpeech(text: string): Promise<Buffer | null> {
  if (!text.trim()) return null;
  const role = await agentService.getModelRoleSettingsSecrets('voice').catch(() => null);
  const isFish = role?.provider === 'fish';
  // The voice role stores the Fish model name (s2.1-pro) in `model`; the
  // reference voice id comes from FISH_AGENT_ID, the same env the call
  // bridge uses — one cloned voice per install.
  const apiKey = (isFish ? role?.apiKey : null) || process.env.FISH_API_KEY?.trim() || '';
  const fishModel = (isFish ? role?.model : null) || process.env.FISH_MODEL?.trim() || 's2.1-pro-free';
  const referenceId = process.env.FISH_AGENT_ID?.trim() || process.env.FISH_REFERENCE_ID?.trim() || '';
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const response = await fetch(FISH_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model: fishModel,
        // Same convention as the call scripts.
        'User-Agent': 'bunwa-chat-runtime/1.0',
      },
      body: JSON.stringify({
        text,
        reference_id: referenceId,
        format: 'mp3',
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`tts: fish -> HTTP ${response.status}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(`tts: synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

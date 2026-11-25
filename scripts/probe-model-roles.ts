/**
 * Probes the stored model-role credentials without touching WhatsApp:
 *  - stt: POST the configured /audio/transcriptions with a short WAV.
 *  - vision: one chat completion against the vision model.
 *
 *   bun run scripts/probe-model-roles.ts
 */
import 'reflect-metadata';
import { configureContainer } from '../src/di/container';
import { agentService } from '../src/core/agent/agent.service';
import { transcribeAudio } from '../src/core/agent/stt';

async function main() {
  try {
    configureContainer();
  } catch {
    /* already configured */
  }

  const stt = await agentService.getModelRoleSettingsSecrets('stt').catch(() => null);
  console.log('stt role   :', stt?.model, '@', stt?.baseUrl, '| key present:', Boolean(stt?.apiKey));

  // Half a second of silence is enough to exercise the endpoint + key.
  const wav = process.env.AUDIO ? Buffer.from(await Bun.file(process.env.AUDIO).arrayBuffer()) : Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAACVkYXRhAAAAAAA=', 'base64');
  const transcript = await transcribeAudio({ bytes: wav, mimetype: process.env.AUDIO ? 'audio/ogg' : 'audio/wav' });
  console.log('stt result :', JSON.stringify(transcript), '(null means the call failed — see warnings above)');

  const vision = await agentService.getVisionSettings().catch((e: unknown) => {
    console.log('vision error:', String(e));
    return null;
  });
  if (vision) {
    console.log('vision role:', vision.model, '@', vision.baseUrl, '| key present:', Boolean(vision.apiKey));
    try {
      const response = await fetch(`${vision.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vision.apiKey}`,
          ...(vision.baseUrl.includes('opencode.ai') ? { 'x-opencode-session': 'bunwa-vision' } : {}),
        },
        body: JSON.stringify({ model: vision.model, messages: [{ role: 'user', content: 'Reply with OK' }], max_tokens: 600 }),
      });
      const text = await response.text();
      console.log('vision HTTP:', response.status, '->', text.slice(0, 160));
    } catch (error) {
      console.log('vision HTTP: threw', String(error));
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

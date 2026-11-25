/**
 * Replay the media path for one stored message: download through the engine,
 * then the same read the chat runtime does. Proves whether a missing voice-note
 * transcript is a download problem, a storage problem or a stt problem.
 *
 *   SESSION=bunweb CHAT=259730245173356@lid MESSAGE_ID=2AA2707DA36300A23126 bun run scripts/verify-media-path.ts
 */
import 'reflect-metadata';
import { readMediaFile } from '../src/mcp/tools/media.tools';
import { transcribeAudio } from '../src/core/agent/stt';

async function main() {
  const baseUrl = process.env.BUNWA_URL || 'http://127.0.0.1:3001';
  const apiKey = process.env.BUNWA_API_KEY ?? '';
  const headers: Record<string, string> = apiKey ? { 'X-Api-Key': apiKey } : {};
  const session = process.env.SESSION || 'bunweb';
  const chatId = process.env.CHAT || '';
  const messageId = process.env.MESSAGE_ID || '';
  if (!chatId || !messageId) throw new Error('CHAT and MESSAGE_ID are required');

  const url = `${baseUrl}/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${messageId}?downloadMedia=true`;
  const response = await fetch(url, { headers });
  const body: any = await response.json().catch(() => null);
  console.log('GET message ->', response.status);
  console.log('hasMedia:', body?.hasMedia, '| media:', JSON.stringify(body?.media ?? null));

  const media = body?.media;
  if (!media?.url) {
    console.log('NO STORED MEDIA — the download or the save failed');
    process.exit(0);
  }

  const name = decodeURIComponent(String(media.url).split('/').pop() ?? '');
  console.log('stored file:', name);
  const { bytes, mimetype } = await readMediaFile(session, name, 20 * 1024 * 1024);
  console.log('bytes:', bytes.length, 'mimetype:', mimetype);

  // ogg/opus → wav is what the stt path expects
  const started = Date.now();
  const transcript = await transcribeAudio({ bytes, mimetype, language: undefined });
  console.log(`transcript (${Date.now() - started} ms):`, JSON.stringify(transcript));
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});

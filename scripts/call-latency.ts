/**
 * Latency probe for the call agent stages: STT, LLM, TTS.
 * Run: bun run scripts/call-latency.ts
 *
 * Prints per-stage timings so the end-of-speech → first-audio budget can be
 * attacked where it actually costs.
 */
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const geminiKey = process.env.GEMINI_API_KEY || '';
const fishKey = process.env.FISH_API_KEY || '';
const voice = process.env.FISH_REFERENCE_ID || '1d52788f35774a409b20df01399afc70';

function now(): number {
  return performance.now();
}

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = now();
  const value = await run();
  console.log(`${label}: ${(now() - started).toFixed(0)} ms`);
  return value;
}

function pcmToWav(pcm: Buffer, sampleRate = 16_000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function gemini(model: string, body: unknown, apiVersion = 'v1beta'): Promise<any> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error(`${model} ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

function pcm(seconds: number): Buffer {
  const samples = Math.floor(16_000 * seconds);
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    buffer.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 220 * i) / 16_000)), i * 2);
  }
  return buffer;
}

async function main(): Promise<void> {
  if (!geminiKey || !fishKey) {
    console.error('GEMINI_API_KEY and FISH_API_KEY are required');
    process.exit(2);
  }

  // A 2 s clip is representative of one utterance; the audio body is what STT
  // bills and what the network carries.
  const wav = pcmToWav(pcm(2));

  console.log(`\n--- warm-up (first call pays TLS + cold start) ---`);
  await gemini('gemini-2.5-flash', { contents: [{ parts: [{ text: 'ping' }] }] }).catch(() => null);

  console.log(`\n--- STT ---`);
  for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-flash']) {
    try {
      await timed(`stt ${model}`, () =>
        gemini(model, {
          contents: [{
            parts: [
              { text: 'Transcribe. Return only the words.' },
              { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
            ],
          }],
        }),
      );
    } catch (error) {
      console.log(`stt ${model}: FAILED ${error instanceof Error ? error.message.slice(0, 120) : error}`);
    }
  }

  console.log(`\n--- LLM ---`);
  for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.8-flash']) {
    try {
      await timed(`llm ${model}`, () =>
        gemini(model, {
          systemInstruction: { parts: [{ text: 'Reply in one short spoken sentence.' }] },
          contents: [{ parts: [{ text: 'The caller said: how are you today?' }] }],
        }),
      );
    } catch (error) {
      console.log(`llm ${model}: FAILED ${error instanceof Error ? error.message.slice(0, 120) : error}`);
    }
  }

  console.log(`\n--- TTS (buffered) ---`);
  const text = 'Sure, I can hear you clearly. What would you like to talk about?';
  for (const format of ['mp3', 'opus', 'pcm'] as const) {
    const started = now();
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fishKey}`,
        'Content-Type': 'application/json',
        model: process.env.FISH_MODEL || 's2.1-pro-free',
        'User-Agent': 'bunwa-call-agent/1.0',
      },
      body: JSON.stringify({ text, reference_id: voice, format }),
    });
    if (!response.ok) {
      console.log(`tts ${format}: FAILED ${response.status}`);
      continue;
    }
    const bytes = (await response.arrayBuffer()).byteLength;
    console.log(`tts ${format}: ${(now() - started).toFixed(0)} ms, ${bytes} bytes`);
  }

  console.log(`\n--- TTS (time to first chunk, streamed) ---`);
  for (const format of ['mp3', 'pcm'] as const) {
    const started = now();
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fishKey}`,
        'Content-Type': 'application/json',
        model: process.env.FISH_MODEL || 's2.1-pro-free',
        'User-Agent': 'bunwa-call-agent/1.0',
      },
      body: JSON.stringify({ text, reference_id: voice, format }),
    });
    if (!response.ok || !response.body) {
      console.log(`tts-stream ${format}: FAILED ${response.status}`);
      continue;
    }
    const reader = response.body.getReader();
    const first = await reader.read();
    const ttfb = now() - started;
    let total = first.value?.byteLength ?? 0;
    let chunks = 1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks += 1;
    }
    console.log(`tts-stream ${format}: first ${ttfb.toFixed(0)} ms, ${chunks} chunks, ${total} bytes in ${(now() - started).toFixed(0)} ms`);
  }
}

await main();

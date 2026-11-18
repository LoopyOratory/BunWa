/**
 * Reference live-conversation agent for BunWa calls.
 *
 * It consumes the SSE audio stream from a WEBJS call, detects utterances in the
 * raw PCM16 stream, transcribes them with Gemini, generates a short reply,
 * synthesises it with Fish Audio and posts the clip back through /calls/speak.
 *
 * This is a reference implementation, not a production voice stack: the VAD is
 * energy-based and the turn-taking is half-duplex. It exists so the gateway's
 * audio path can be exercised end to end without a second service.
 *
 * Usage:
 *   BUNWA_URL=http://127.0.0.1:3001 \
 *   WAHA_API_KEY=... SESSION=calltest \
 *   GEMINI_API_KEY=... FISH_API_KEY=... \
 *   bun run scripts/call-agent.ts
 */

export interface AudioChunk {
  data: string;
  mimeType: string;
  at: number;
}

export interface SSEEvent {
  event: string;
  data: string;
}

/** Incremental server-sent-events decoder. */
export class SSEDecoder {
  private buffer = '';

  feed(text: string): SSEEvent[] {
    this.buffer += text.replace(/\r\n/g, '\n');
    const events: SSEEvent[] = [];
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseSSEBlock(block);
      if (event) events.push(event);
      boundary = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}

export function parseSSEBlock(block: string): SSEEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  return { event, data: data.join('\n') };
}

/**
 * Resample mono PCM16 to 16 kHz by averaging each source window. Good enough
 * for speech recognition; the tap normally runs at 48 kHz.
 */
export function resamplePcm16(pcm: Buffer, fromRate: number, toRate = 16_000): Buffer {
  if (fromRate === toRate) return pcm;
  const input = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const ratio = fromRate / toRate;
  const outputLength = Math.max(0, Math.floor(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end && j < input.length; j++) sum += input[j];
    output[i] = Math.max(-32768, Math.min(32767, Math.round(sum / (end - start))));
  }
  return Buffer.from(output.buffer);
}

/** Wrap 16-bit mono PCM in a WAV container. */
export function pcmToWav(pcm: Buffer, sampleRate = 16_000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Energy VAD over 16 kHz mono PCM16. Emits one Buffer per utterance, with a
 * short pre-roll so the first syllable is not clipped.
 */
export class EnergyVAD {
  private frame = Buffer.alloc(0);
  private preroll: Buffer[] = [];
  private speech: Buffer[] = [];
  private voiced = 0;
  private silent = 0;
  private active = false;

  constructor(
    private readonly threshold = 500,
    private readonly sampleRate = 16_000,
    private readonly preRollFrames = 10,
    private readonly silenceFrames = 25,
    private readonly maxUtteranceFrames = 1500,
  ) {}

  push(chunk: Buffer): Buffer[] {
    this.frame = Buffer.concat([this.frame, chunk]);
    const frameBytes = Math.floor(this.sampleRate * 0.02) * 2; // 20 ms
    const utterances: Buffer[] = [];

    while (this.frame.length >= frameBytes) {
      const frame = this.frame.subarray(0, frameBytes);
      this.frame = this.frame.subarray(frameBytes);
      const rms = this.rms(frame);

      if (rms >= this.threshold) {
        this.voiced += 1;
        this.silent = 0;
        if (!this.active && this.voiced >= 3) {
          this.active = true;
          this.speech = [...this.preroll];
        }
      } else {
        this.silent += 1;
        this.voiced = 0;
      }

      if (this.active) {
        this.speech.push(frame);
        if (this.silent >= this.silenceFrames || this.speech.length >= this.maxUtteranceFrames) {
          const utterance = Buffer.concat(this.speech);
          this.speech = [];
          this.active = false;
          this.voiced = 0;
          this.silent = 0;
          if (utterance.length > this.sampleRate * 0.2 * 2) utterances.push(utterance);
        }
      } else {
        this.preroll.push(frame);
        if (this.preroll.length > this.preRollFrames) this.preroll.shift();
      }
    }
    return utterances;
  }

  private rms(frame: Buffer): number {
    let sum = 0;
    const samples = Math.floor(frame.length / 2);
    for (let i = 0; i < samples; i++) {
      const value = frame.readInt16LE(i * 2);
      sum += value * value;
    }
    return Math.sqrt(sum / Math.max(1, samples));
  }
}

/* ------------------------------------------------------------------------- */
/* Provider calls                                                            */
/* ------------------------------------------------------------------------- */

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

async function gemini(apiKey: string, model: string, body: unknown): Promise<any> {
  const response = await fetch(`${GEMINI}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

export async function transcribe(apiKey: string, wav: Buffer): Promise<string> {
  const result = await gemini(apiKey, 'gemini-2.5-flash', {
    contents: [{
      parts: [
        { text: 'Transcribe the speech in this audio. Return only the words, no commentary. If there is no speech, return an empty string.' },
        { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
      ],
    }],
  });
  return String(result?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function reply(apiKey: string, transcript: string, history: string[], systemPrompt: string): Promise<string> {
  const context = history.slice(-8).join('\n');
  const result = await gemini(apiKey, 'gemini-2.5-flash', {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{
      parts: [{ text: `${context ? `Conversation so far:\n${context}\n\n` : ''}The caller said: ${transcript}` }],
    }],
  });
  return String(result?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
}

export async function synthesise(text: string, apiKey: string, voice: string): Promise<Buffer> {
  const response = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      model: process.env.FISH_MODEL || 's2.1-pro-free',
      'User-Agent': 'bunwa-call-agent/1.0',
    },
    body: JSON.stringify({ text, reference_id: voice, format: 'mp3' }),
  });
  if (!response.ok) throw new Error(`Fish ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return Buffer.from(await response.arrayBuffer());
}

/* ------------------------------------------------------------------------- */
/* Live loop                                                                 */
/* ------------------------------------------------------------------------- */

async function postSpeak(baseUrl: string, apiKey: string, session: string, audio: Buffer): Promise<void> {
  const response = await fetch(`${baseUrl}/api/${session}/calls/speak`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: audio.toString('base64') }),
  });
  if (!response.ok) throw new Error(`speak ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

export async function runLive(options: {
  baseUrl: string;
  apiKey: string;
  session: string;
  geminiKey: string;
  fishKey: string;
  voice: string;
  systemPrompt: string;
}): Promise<void> {
  const response = await fetch(`${options.baseUrl}/api/${options.session}/calls/audio`, {
    headers: { 'X-Api-Key': options.apiKey, Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`audio stream ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  // The WEBJS tap emits raw PCM16 (`audio/pcm;rate=<rate>`), so no container
  // decoding is needed. Older captures that still send WebM are skipped.
  const vad = new EnergyVAD();
  const history: string[] = [];
  let speaking = false;
  let pending = Buffer.alloc(0);

  const handleUtterance = async (pcm: Buffer) => {
    if (speaking) return;
    speaking = true;
    try {
      const wav = pcmToWav(pcm);
      const transcript = await transcribe(options.geminiKey, wav);
      if (!transcript) return;
      console.log('caller:', transcript);
      const answer = await reply(options.geminiKey, transcript, history, options.systemPrompt);
      if (!answer) return;
      console.log('agent:', answer);
      const audio = await synthesise(answer, options.fishKey, options.voice);
      await postSpeak(options.baseUrl, options.apiKey, options.session, audio);
      history.push(`Caller: ${transcript}`, `Agent: ${answer}`);
    } catch (error) {
      console.error('turn failed:', error instanceof Error ? error.message : error);
    } finally {
      speaking = false;
    }
  };

  const feed = (pcm: Buffer) => {
    pending = Buffer.concat([pending, pcm]);
    // Keep the VAD frame-aligned: 20 ms at 16 kHz mono = 640 bytes.
    const usable = pending.length - (pending.length % 640);
    if (!usable) return;
    const slice = pending.subarray(0, usable);
    pending = pending.subarray(usable);
    for (const utterance of vad.push(slice)) void handleUtterance(utterance);
  };

  const decoder = new SSEDecoder();
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const textDecoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of decoder.feed(textDecoder.decode(value, { stream: true }))) {
        if (event.event !== 'audio') continue;
        try {
          const chunk = JSON.parse(event.data) as AudioChunk;
          const match = /rate=(\d+)/.exec(chunk.mimeType || '');
          if (!match) continue;
          const rate = Number(match[1]);
          const pcm = Buffer.from(chunk.data, 'base64');
          feed(resamplePcm16(pcm, rate, 16_000));
        } catch {
          /* skip malformed chunk */
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

async function main(): Promise<void> {
  const baseUrl = process.env.BUNWA_URL || 'http://127.0.0.1:3001';
  const apiKey = process.env.WAHA_API_KEY || '';
  const session = process.env.SESSION || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const fishKey = process.env.FISH_API_KEY || '';
  const voice = process.env.FISH_REFERENCE_ID || '1d52788f35774a409b20df01399afc70';
  const systemPrompt = process.env.CALL_SYSTEM_PROMPT
    || 'You are a concise phone assistant. Reply in one or two short sentences. Plain language, no lists.';

  if (!apiKey || !session || !geminiKey || !fishKey) {
    console.error('Set WAHA_API_KEY, SESSION, GEMINI_API_KEY and FISH_API_KEY.');
    process.exit(2);
  }

  console.log(`listening on ${baseUrl} session=${session}`);
  await runLive({ baseUrl, apiKey, session, geminiKey, fishKey, voice, systemPrompt });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

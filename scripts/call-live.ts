/**
 * Low-latency live voice agent for BunWa WhatsApp calls.
 *
 * The turn-based recipe (VAD → STT → LLM → TTS → speak) costs roughly
 * 4.2 s before the first syllable. This agent removes the pipeline: inbound
 * PCM16 goes straight into Gemini Live over a WebSocket, and the model's own
 * 24 kHz audio is resampled to the call's 16 kHz and streamed into the
 * PulseAudio virtual microphone in ~100 ms writes.
 *
 * Measured on this host with gemini-3.8-live: 0.23 s setup and ~0.8 s to first
 * audio for a text turn, i.e. well under 1 s after the user stops speaking.
 *
 * Run:
 *   GEMINI_API_KEY=... BUNWA_CALL_AUDIO_SINK=wa_out bun run call:live
 *
 * Env:
 *   BUNWA_URL            default http://127.0.0.1:3001
 *   BUNWA_SESSION        default calltest
 *   BUNWA_API_KEY        required
 *   GEMINI_API_KEY       required
 *   GEMINI_LIVE_MODEL    default gemini-3.8-live
 *   BUNWA_CALL_AUDIO_SINK  when set, audio is written with pacat (virtual mic)
 *   BUNWA_SYSTEM_PROMPT  system instruction for the voice agent
 */
import { spawn } from 'bun';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const LIVE_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const CALL_RATE = 16_000;
const LIVE_RATE = 24_000;

const env = {
  baseUrl: process.env.BUNWA_URL || 'http://127.0.0.1:3001',
  session: process.env.BUNWA_SESSION || 'calltest',
  apiKey: process.env.BUNWA_API_KEY || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
  sink: process.env.BUNWA_CALL_AUDIO_SINK || '',
  language: process.env.BUNWA_LANGUAGE || 'English',
  pacing: Number(process.env.BUNWA_AUDIO_PACING || '0'),
  systemPrompt:
    process.env.BUNWA_SYSTEM_PROMPT ||
    'You are a helpful assistant on a live WhatsApp phone call. Keep every reply to one or two short spoken sentences. Never use markdown, lists, emoji, or stage directions. Speak naturally and leave room for the caller to interrupt.',
};

/* ------------------------------------------------------------------------- */
/* Audio                                                                     */
/* ------------------------------------------------------------------------- */

/** Linear resample of mono PCM16. Good enough for speech at these ratios. */
export function resamplePcm16(input: Buffer, from: number, to: number): Buffer {
  if (from === to) return input;
  const inSamples = Math.floor(input.length / 2);
  if (!inSamples) return Buffer.alloc(0);
  const ratio = to / from;
  const outSamples = Math.max(1, Math.floor(inSamples * ratio));
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const a = input.readInt16LE(Math.min(index, inSamples - 1) * 2);
    const b = input.readInt16LE(Math.min(index + 1, inSamples - 1) * 2);
    const value = Math.round(a + (b - a) * fraction);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2);
  }
  return out;
}

/**
 * Stateful resampler for streaming audio.
 *
 * Resampling each WebSocket chunk independently resets the fractional phase at
 * every chunk boundary, which adds a click/discontinuity roughly every 100 ms
 * and sounds choppy. This carries the last input sample and the fractional
 * position across chunks, so the output is continuous.
 */
export class StreamingResampler {
  private previous: number | null = null;
  private position = 0;

  constructor(
    private readonly from: number,
    private readonly to: number,
  ) {}

  reset(): void {
    this.previous = null;
    this.position = 0;
  }

  push(chunk: Buffer): Buffer {
    if (this.from === this.to) return chunk;
    const count = Math.floor(chunk.length / 2);
    if (!count) return Buffer.alloc(0);

    const samples = new Int16Array(count);
    for (let i = 0; i < count; i++) samples[i] = chunk.readInt16LE(i * 2);

    let input: Int16Array;
    if (this.previous === null) {
      this.previous = samples[0];
      input = samples;
    } else {
      input = new Int16Array(count + 1);
      input[0] = this.previous;
      input.set(samples, 1);
    }

    const ratio = this.from / this.to;
    const out: number[] = [];
    while (this.position < input.length - 1) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const value = input[index] * (1 - fraction) + input[index + 1] * fraction;
      out.push(Math.max(-32768, Math.min(32767, Math.round(value))));
      this.position += ratio;
    }

    this.position -= input.length - 1;
    this.previous = input[input.length - 1];

    const output = Buffer.alloc(out.length * 2);
    for (let i = 0; i < out.length; i++) output.writeInt16LE(out[i], i * 2);
    return output;
  }
}

/**
 * Writes PCM16 to the PulseAudio sink that Chrome captures as its
 * microphone. One long-lived pacat process avoids per-utterance spawn cost.
 */
export class SinkWriter {
  private proc: ReturnType<typeof spawn> | null = null;
  private startedAt = 0;
  private writtenBytes = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly sink: string,
    private readonly rate: number,
    private readonly pacing: number,
    private readonly latencyMs = 250,
  ) {}

  private ensure(): ReturnType<typeof spawn> {
    if (this.proc) return this.proc;
    const pacat = process.env.PACAT_PATH || '/opt/data/pulse/usr/bin/pacat';
    const pulseServer = process.env.PULSE_SERVER || 'unix:/tmp/pulse-native';
    const libraryPath =
      process.env.PULSE_LD_LIBRARY_PATH ||
      '/opt/data/pulse/usr/lib/x86_64-linux-gnu:/opt/data/pulse/usr/lib/x86_64-linux-gnu/pulseaudio:/opt/data/pulse/usr/lib/pulse-17.0+dfsg1/modules:/opt/data/pulse/lib/x86_64-linux-gnu';

    const proc = spawn(
      [pacat, '--playback', `--device=${this.sink}`, '--format=s16le', `--rate=${this.rate}`, '--channels=1', `--latency-msec=${this.latencyMs}`],
      {
        env: { ...process.env, PULSE_SERVER: pulseServer, LD_LIBRARY_PATH: libraryPath },
        stdin: 'pipe',
        stdout: 'ignore',
        stderr: 'pipe',
      },
    );
    this.proc = proc;
    this.startedAt = performance.now();
    this.writtenBytes = 0;
    proc.exited.then((code) => {
      if (!this.closed && code !== 0) console.error(`pacat exited ${code}`);
      this.proc = null;
    });
    return proc;
  }

  /**
   * Pace writes so the sink buffer does not run ahead of real time. Without
   * this the whole reply lands in PulseAudio at once and the callee hears it
   * all queued at the wrong moment.
   */
  private async pace(): Promise<void> {
    if (!this.pacing) return;
    const playedMs = (this.writtenBytes / (this.rate * 2)) * 1000;
    const elapsed = performance.now() - this.startedAt;
    const lead = playedMs - elapsed * this.pacing;
    if (lead > 120) {
      await new Promise((resolve) => setTimeout(resolve, lead - 120));
    }
  }

  write(pcm: Buffer): Promise<void> {
    if (this.closed || !pcm.length) return Promise.resolve();
    this.writeChain = this.writeChain.then(async () => {
      const proc = this.ensure();
      const stdin = proc.stdin as any;
      if (!stdin?.write) return;
      this.writtenBytes += pcm.length;
      await this.pace();
      // Bun's FileSink.write() is synchronous and does NOT take a callback;
      // passing one silently never resolves, which delayed every 20 ms chunk
      // by the 1 s fallback timer and made the output choppy. Flush instead.
      stdin.write(pcm);
      await Promise.race([
        typeof stdin.flush === 'function' ? stdin.flush() : Promise.resolve(),
        new Promise<void>((resolve) => setTimeout(resolve, 1000)),
      ]);
    });
    return this.writeChain;
  }

  /**
   * Resolve when the current write chain settles, without queueing anything.
   * A dead sink process leaves `stdin.write` callbacks pending, so callers
   * that must not hang (barge-in flush, shutdown) use this with a timeout.
   */
  async settled(timeoutMs = 500): Promise<void> {
    const current = this.writeChain;
    await Promise.race([
      current,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  /** Drop queued audio (barge-in) by restarting the writer. */
  async flush(): Promise<void> {
    await this.settled(200);
    this.writeChain = Promise.resolve();
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try { proc.kill(); } catch {}
    }
    this.startedAt = performance.now();
    this.writtenBytes = 0;
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.settled(200);
    this.writeChain = Promise.resolve();
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      try { (proc.stdin as any)?.end(); } catch {}
      try { proc.kill(); } catch {}
    }
  }
}

/* ------------------------------------------------------------------------- */
/* SSE decoding for the call audio stream                                    */
/* ------------------------------------------------------------------------- */

export function decodeSseLine(line: string): { event?: string; data?: string } | null {
  const trimmed = line.replace(/\r$/, '');
  if (!trimmed.startsWith('data:')) return null;
  return { data: trimmed.slice(5).trim() };
}

/* ------------------------------------------------------------------------- */
/* Live session                                                              */
/* ------------------------------------------------------------------------- */

function liveUrl(key: string): string {
  return `${LIVE_ENDPOINT}?key=${encodeURIComponent(key)}`;
}

async function toText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  try {
    return await new Response(data as Blob).text();
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  if (!env.apiKey || !env.geminiKey) {
    console.error('BUNWA_API_KEY and GEMINI_API_KEY are required');
    process.exit(2);
  }
  if (!env.sink) {
    console.error(
      'BUNWA_CALL_AUDIO_SINK is required: this agent streams audio into the PulseAudio virtual microphone.\n' +
        'Start it with `bun run call:audio-device` and export BUNWA_CALL_AUDIO_SINK=wa_out.',
    );
    process.exit(2);
  }

  const writer = new SinkWriter(env.sink, CALL_RATE, env.pacing);
  const outboundResampler = new StreamingResampler(LIVE_RATE, CALL_RATE);
  let inboundResampler: StreamingResampler | null = null;
  let inboundRate = CALL_RATE;
  let interrupt = false;

  const socket = new WebSocket(liveUrl(env.geminiKey));
  socket.binaryType = 'arraybuffer';

  const ready = new Promise<void>((resolve, reject) => {
    socket.onopen = () => {
      socket.send(JSON.stringify({
        setup: {
          model: `models/${env.model}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          systemInstruction: { parts: [{ text: `${env.systemPrompt} Always respond in ${env.language}, even if the caller speaks another language or the audio is noisy.` }] },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: false },
          },
        },
      }));
    };
    socket.onmessage = async (event) => {
      const text = await toText(event.data);
      if (!text) return;
      let message: any;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (message.setupComplete) {
        console.log('live session ready');
        resolve();
        return;
      }
      const content = message.serverContent;
      if (!content) return;

      if (content.interrupted) {
        interrupt = true;
        console.log('caller interrupted — dropping queued audio');
        outboundResampler.reset();
        await writer.flush();
        interrupt = false;
      }
      if (content.inputTranscription?.text) {
        process.stdout.write(`\r[caller] ${content.inputTranscription.text}`);
      }
      if (content.outputTranscription?.text) {
        process.stdout.write(`\r[agent]  ${content.outputTranscription.text}`);
      }
      const parts = content.modelTurn?.parts || [];
      for (const part of parts) {
        if (!part.inlineData?.data || interrupt) continue;
        const pcm24 = Buffer.from(part.inlineData.data, 'base64');
        await writer.write(outboundResampler.push(pcm24));
      }
      if (content.turnComplete) console.log('\n--- turn complete ---');
    };
    socket.onerror = () => reject(new Error('live websocket error'));
    socket.onclose = (event) => {
      console.log(`live socket closed ${event.code}`);
      if (!(event as any).__resolved) resolve();
    };
  });

  await ready;

  // Inbound call audio: SSE from BunWa, raw PCM16 at 16 kHz. The stream is
  // closed whenever a call ends or the gateway restarts, so reconnect instead
  // of letting the process die; the live model session stays up across calls.
  for (;;) {
    try {
      const response = await fetch(`${env.baseUrl}/api/${env.session}/calls/audio`, {
        headers: { 'X-Api-Key': env.apiKey, Accept: 'text/event-stream' },
      });
      if (!response.ok || !response.body) {
        throw new Error(`audio stream ${response.status}: ${(await response.text()).slice(0, 200)}`);
      }
      console.log('streaming caller audio into the live model');
      inboundResampler = null;
      inboundRate = CALL_RATE;

      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const decoded = decodeSseLine(line);
          if (!decoded?.data) continue;
          let chunk: any;
          try {
            chunk = JSON.parse(decoded.data);
          } catch {
            continue;
          }
          if (!chunk?.data) continue;
          const pcm = Buffer.from(chunk.data, 'base64');
          if (!pcm.length) continue;
          const rate = Number(/rate=(\d+)/.exec(chunk.mimeType || '')?.[1] || CALL_RATE);
          let audio16: Buffer;
          if (rate === CALL_RATE) {
            audio16 = pcm;
          } else {
            if (!inboundResampler || inboundRate !== rate) {
              inboundResampler = new StreamingResampler(rate, CALL_RATE);
              inboundRate = rate;
            }
            audio16 = inboundResampler.push(pcm);
          }
          socket.send(JSON.stringify({
            realtimeInput: {
              audio: { data: audio16.toString('base64'), mimeType: `audio/pcm;rate=${CALL_RATE}` },
            },
          }));
        }
      }
      console.log('call audio stream ended — waiting for the next call');
    } catch (error) {
      console.log(`call audio stream error: ${error instanceof Error ? error.message : error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

if (import.meta.main) {
  await main();
}

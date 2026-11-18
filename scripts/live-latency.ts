/**
 * Measure Gemini Live speech-to-speech latency.
 *
 * Streams a raw PCM16 16 kHz question in real time, then reports the time from
 * the end of the spoken question to the first model audio chunk. This is the
 * same path BunWa's live call agent uses, without a WhatsApp call in the loop.
 *
 * Usage:
 *   GEMINI_API_KEY=... bun scripts/live-latency.ts <question.pcm> [turns]
 */
const key = process.env.GEMINI_API_KEY || '';
const pcmPath = process.argv[2] || '';
const turns = Math.max(1, Number(process.argv[3] || process.env.LIVE_TURNS || 3));
const model = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
const voice = process.env.GEMINI_LIVE_VOICE || 'Aoede';
const language = process.env.BUNWA_LANGUAGE || 'English';

if (!key) {
  console.error('GEMINI_API_KEY required');
  process.exit(2);
}
if (!pcmPath) {
  console.error('usage: bun scripts/live-latency.ts <question.pcm> [turns]');
  process.exit(2);
}

const pcm = Buffer.from(await Bun.file(pcmPath).arrayBuffer());
if (!pcm.length) {
  console.error('empty PCM file');
  process.exit(2);
}

const endpoint =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' +
  encodeURIComponent(key);

const socket = new WebSocket(endpoint);
socket.binaryType = 'arraybuffer';

const waiters = new Map<string, () => void>();
function waitFor(name: string): Promise<void> {
  return new Promise((resolve) => waiters.set(name, resolve));
}
function signal(name: string): void {
  const resolve = waiters.get(name);
  if (resolve) {
    waiters.delete(name);
    resolve();
  }
}

let setupAt = 0;
let setupMs = 0;
let firstAudioAt = 0;
let lastSpeechAt = 0;
let waitingForAudio = false;
let currentLatency: number | null = null;
const latencies: number[] = [];

socket.onmessage = async (event) => {
  const text = typeof event.data === 'string' ? event.data : await new Response(event.data as Blob).text();
  if (!text) return;
  let message: any;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (message.setupComplete) {
    setupMs = performance.now() - setupAt;
    signal('setup');
    return;
  }
  const content = message.serverContent;
  if (!content) return;
  const parts = content.modelTurn?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      if (waitingForAudio && !firstAudioAt) {
        firstAudioAt = performance.now();
        currentLatency = firstAudioAt - lastSpeechAt;
        latencies.push(currentLatency);
        console.log(`turn ${latencies.length}: first audio ${currentLatency.toFixed(0)} ms after speech end`);
        waitingForAudio = false;
      }
      break;
    }
  }
  if (content.turnComplete) {
    signal('turn');
  }
};

await new Promise<void>((resolve, reject) => {
  socket.onopen = () => resolve();
  socket.onerror = () => reject(new Error('Gemini Live websocket error'));
});

setupAt = performance.now();
socket.send(JSON.stringify({
  setup: {
    model: `models/${model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
    systemInstruction: {
      parts: [{ text: `You are a helpful phone assistant. Keep every reply to one short spoken sentence. Always respond in ${language}.` }],
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: false },
    },
  },
}));

await waitFor('setup');
console.log(`model ${model} setup ${setupMs.toFixed(0)} ms`);

const chunkBytes = 640; // 20 ms at 16 kHz mono
const silence = Buffer.alloc(16_000 * 2 * 0.4); // 400 ms of trailing silence

for (let turn = 0; turn < turns; turn++) {
  waitingForAudio = false;
  firstAudioAt = 0;
  currentLatency = null;

  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    const chunk = pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.length));
    socket.send(JSON.stringify({
      realtimeInput: {
        audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
      },
    }));
    await Bun.sleep(20);
  }
  lastSpeechAt = performance.now();

  for (let offset = 0; offset < silence.length; offset += chunkBytes) {
    const chunk = silence.subarray(offset, Math.min(offset + chunkBytes, silence.length));
    socket.send(JSON.stringify({
      realtimeInput: {
        audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
      },
    }));
    await Bun.sleep(20);
  }
  socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  waitingForAudio = true;

  await Promise.race([waitFor('turn'), Bun.sleep(15_000)]);
  await Bun.sleep(500);
}

const sorted = [...latencies].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
const average = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null;
console.log(JSON.stringify({
  model,
  setupMs: Math.round(setupMs),
  turns: latencies.length,
  latenciesMs: latencies.map((value) => Math.round(value)),
  medianMs: median === null ? null : Math.round(median),
  averageMs: average === null ? null : Math.round(average),
}, null, 2));

socket.close();

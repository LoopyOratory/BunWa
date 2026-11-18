/**
 * Probe which Gemini Live models are available to this API key.
 * Run: bun run scripts/live-probe.ts
 */
const key = process.env.GEMINI_API_KEY || '';
if (!key) {
  console.error('GEMINI_API_KEY required');
  process.exit(2);
}

const candidates = [
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
];

const url =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' +
  key;

async function probe(model: string): Promise<string> {
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;
    let spoke = false;
    const finish = (text: string) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch {}
      resolve(`${((performance.now() - started) / 1000).toFixed(2)}s ${text}`);
    };
    const socket = new WebSocket(url);
    socket.onopen = () => {
      socket.send(JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          systemInstruction: { parts: [{ text: 'You are a test harness. Reply with one short sentence.' }] },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
      }));
      setTimeout(() => finish('no setup reply'), 15_000);
    };
    socket.onmessage = async (event) => {
      const data = typeof event.data === 'string' ? event.data : await new Response(event.data as Blob).text();
      if (data.includes('setupComplete') && !spoke) {
        spoke = true;
        console.log(`  ${model} setup in ${((performance.now() - started) / 1000).toFixed(2)}s`);
        socket.send(JSON.stringify({
          clientContent: { turns: [{ role: 'user', parts: [{ text: 'Say hello in five words.' }] }], turnComplete: true },
        }));
        setTimeout(() => finish('no audio after text turn'), 15_000);
        return;
      }
      try {
        const parsed = JSON.parse(data);
        const parts = parsed?.serverContent?.modelTurn?.parts || [];
        const audio = parts.find((part: any) => part.inlineData?.data);
        if (audio) {
          console.log(`  first audio chunk after ${((performance.now() - started) / 1000).toFixed(2)}s (${audio.inlineData.mimeType}, ${audio.inlineData.data.length} b64 chars)`);
        }
        if (parsed?.serverContent?.outputTranscription?.text) {
          console.log(`  transcript: ${parsed.serverContent.outputTranscription.text}`);
        }
        if (parsed?.serverContent?.turnComplete) finish('OK turnComplete');
      } catch {
        /* ignore */
      }
    };
    socket.onerror = () => finish('ERROR event');
    socket.onclose = (event) =>
      finish(`CLOSE ${event.code} ${String((event as any).reason || '').slice(0, 200)}`);
  });
}

for (const model of candidates) {
  console.log(model, '=>', await probe(model));
}

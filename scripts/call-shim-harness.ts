/**
 * Manual verification harness for the WhatsApp Web call shims.
 *
 * It does not touch WhatsApp. It loads the injected functions in Chromium with
 * mocked WAWeb* modules, places a fake call, injects a 0.2 s WAV, ends the call
 * and checks that the audio tap produces MediaRecorder chunks.
 *
 * Run from the repo root:
 *   bun run scripts/call-shim-harness.ts
 */
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { installCallShims, installAudioTap } from '../src/core/engines/webjs/calls.webjs';

function loadPuppeteer(): any {
  const store = path.join(process.cwd(), 'node_modules', '.bun');
  const dir = fs.readdirSync(store).find((name) => name.startsWith('puppeteer@'));
  if (!dir) throw new Error('puppeteer is not installed under node_modules/.bun');
  const requireFromStore = createRequire(path.join(store, dir, 'node_modules', 'puppeteer', 'package.json'));
  return requireFromStore('puppeteer');
}

function findChromium(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('No Chromium found. Set PUPPETEER_EXECUTABLE_PATH or CHROME_PATH.');
}

function tinyWavBase64(): string {
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * 0.2);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000), 44 + i * 2);
  }
  return buf.toString('base64');
}

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: findChromium(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
});

try {
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');

  await page.evaluate(() => {
    const calls: any[] = [];
    const collection: any = { lastActiveCall: null, isInConnectedCall: false };
    (window as any).__mock = { calls, collection };

    const modules: Record<string, any> = {
      WAWebVoipStackInterface: {
        getVoipStackInterface: () => ({
          acceptCall: async (id: string, video: boolean) => calls.push(['accept', id, video]),
          endCall: async (id: string, reason: number) => calls.push(['end', id, reason]),
          rejectCall: async () => calls.push(['reject']),
        }),
      },
      WAWebWamEnumCallTermReason: { CALL_TERM_REASON: { ENDED_BY_USER: 1 } },
      WAWebCallCollection: collection,
      WAWebWidFactory: { createWid: (value: string) => ({ _serialized: value }) },
      WAWebQueryExistsJob: {
        queryPhoneExists: async () => ({ wid: { _serialized: '233201234567@c.us' } }),
      },
      WAWebWamEnumCallFromUi: { CALL_FROM_UI: { CONVERSATION: 2 } },
      WAWebWamEnumLobbyEntryPointType: { LOBBY_ENTRY_POINT_TYPE: { NOT_OPENED: 0 } },
      WAWebVoipStartCall: {
        startWAWebVoipCall: async (wid: any, isVideo: boolean, ...rest: any[]) => {
          calls.push(['start', wid._serialized, isVideo, rest]);
          collection.lastActiveCall = {
            id: 'call-1',
            peerJid: wid,
            isVideo,
            isGroup: false,
            outgoing: true,
            offerTime: Date.now(),
            getState: () => 1,
          };
        },
      },
      WAGetUserMedia: {
        getUserMedia: async () => {
          throw new Error('real microphone should not be requested');
        },
      },
    };

    (window as any).require = (name: string) => modules[name];
    (window as any).WWebJS = {};
    (window as any).__audioChunks = [];
    (window as any).__bunwaCallAudio = (data: string, mime: string) => {
      (window as any).__audioChunks.push({ data, mime });
    };
    // Headless about:blank has no secure context, so provide the browser API
    // the production page has. The shim must intercept this, not call it.
    if (!(navigator as any).mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new Error('real microphone should not be requested');
          },
        },
      });
    }
  });

  await page.evaluate(installCallShims);

  const call = await page.evaluate(() =>
    (window as any).WWebJS.startCall('233201234567@c.us', false, false, 1000, true),
  );

  await page.evaluate(() => {
    (window as any).__mock.collection.isInConnectedCall = true;
  });

  const active = await page.evaluate(() => (window as any).WWebJS.getActiveCall());
  const duration = await page.evaluate(
    (audio: string) => (window as any).WWebJS.playCallAudio(audio),
    tinyWavBase64(),
  );
  await new Promise((resolve) => setTimeout(resolve, 400));
  const playbackRms = await page.evaluate(() => (window as any).WWebJS._lastPlaybackRms);
  const connected = await page.evaluate(() => (window as any).WWebJS.isCallConnected('call-1'));
  const ended = await page.evaluate(() => (window as any).WWebJS.endCall('call-1'));
  const mockCalls = await page.evaluate(() => (window as any).__mock.calls);

  const gum = await page.evaluate(async () => {
    (window as any).WWebJS.setupCallMediaStream();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return {
      audioTracks: stream.getAudioTracks().length,
      calls: (window as any).WWebJS._getUserMediaCalls,
    };
  });

  await page.evaluate(installAudioTap);
  await page.evaluate(async () => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    await new Promise((resolve) => setTimeout(resolve, 700));
    osc.stop();
    await ctx.close();
  });
  const chunks = await page.evaluate(() => (window as any).__audioChunks.length);
  const pcm = await page.evaluate(() => {
    const chunk = (window as any).__audioChunks[0];
    if (!chunk) return null;
    const binary = atob(chunk.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const samples = new Int16Array(bytes.buffer);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return {
      mimeType: chunk.mime,
      samples: samples.length,
      rms: Math.sqrt(sum / Math.max(1, samples.length)),
    };
  });

  const failures: string[] = [];
  if (!call || call.id !== 'call-1') failures.push('startCall did not return the call');
  if (!active || active.id !== 'call-1') failures.push('getActiveCall failed');
  if (typeof duration !== 'number' || duration <= 0) failures.push('playCallAudio returned no duration');
  if (typeof playbackRms !== 'number' || playbackRms <= 0) failures.push('master bus measured silence');
  if (connected !== true) failures.push('isCallConnected was false');
  if (ended !== true) failures.push('endCall failed');
  if (!mockCalls.some((entry: any[]) => entry[0] === 'end' && entry[1] === 'call-1')) {
    failures.push('endCall did not reach the stack');
  }
  if (chunks < 1) failures.push('audio tap produced no chunks');
  if (!pcm || !String(pcm.mimeType).startsWith('audio/pcm')) failures.push('audio tap did not emit PCM');
  if (!pcm || pcm.rms < 1) failures.push('audio tap emitted silence');
  if (gum.audioTracks < 1) failures.push('getUserMedia patch returned no audio track');
  if (!gum.calls.some((call: any) => call.source === 'mediaDevices' && call.injected)) {
    failures.push('mediaDevices.getUserMedia was not intercepted');
  }

  console.log('call:', JSON.stringify(call));
  console.log('active:', JSON.stringify(active));
  console.log('playAudio duration:', duration);
  console.log('playback rms:', playbackRms);
  console.log('audio chunks:', chunks);
  console.log('pcm:', JSON.stringify(pcm));
  console.log('getUserMedia:', JSON.stringify(gum));

  if (failures.length) {
    console.error('FAIL:', failures.join('; '));
    process.exit(1);
  }
  console.log('PASS: call shims and audio tap work in Chromium');
} finally {
  await browser.close();
}

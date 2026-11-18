/**
 * Auto-answers an incoming WhatsApp call and starts the Gemini Live agent.
 *
 * Run:
 *   BUNWA_URL=... BUNWA_API_KEY=... BUNWA_SESSION=... GEMINI_API_KEY=... \
 *   GEMINI_LIVE_MODEL=gemini-3.8-live GEMINI_LIVE_VOICE=Aoede bun run call:inbound-live
 */
import { spawn } from 'bun';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const env = {
  bunwaUrl: process.env.BUNWA_URL || 'http://127.0.0.1:3001',
  session: process.env.BUNWA_SESSION || 'calltest',
  apiKey: process.env.BUNWA_API_KEY || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
  voice: process.env.GEMINI_LIVE_VOICE || 'Aoede',
  language: process.env.BUNWA_LANGUAGE || 'English',
  sink: process.env.BUNWA_CALL_AUDIO_SINK || 'wa_tts',
  pacat: process.env.PACAT_PATH || '/opt/data/pulse/usr/bin/pacat',
  pulseServer: process.env.PULSE_SERVER || 'unix:/tmp/pulse-native',
};

async function api(pathname: string, body?: any): Promise<any> {
  const response = await fetch(`${env.bunwaUrl}/api/${env.session}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'X-Api-Key': env.apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${pathname} ${response.status}`);
  return response.json();
}

async function main(): Promise<void> {
  console.log('watching for an incoming call');
  let accepted = false;

  while (!accepted) {
    try {
      const { call } = await api('/calls/active');
      if (call && call.outgoing === false && !accepted) {
        console.log('incoming call', call.id);
        await api('/calls/accept', {
          callId: call.id,
          video: false,
          injectAudio: false,
        });
        console.log('call accepted');
        accepted = true;
        break;
      }
    } catch {
      /* keep polling */
    }
    await Bun.sleep(1000);
  }

  // Start the live agent against the accepted call.
  const proc = spawn({
    cmd: [
      '/opt/data/home/.bun/bin/bun',
      'run',
      'scripts/call-live.ts',
    ],
    cwd: import.meta.dir.replace('/scripts', ''),
    env: {
      ...process.env,
      BUNWA_URL: env.bunwaUrl,
      BUNWA_SESSION: env.session,
      BUNWA_API_KEY: env.apiKey,
      GEMINI_API_KEY: env.geminiKey,
      GEMINI_LIVE_MODEL: env.model,
      GEMINI_LIVE_VOICE: env.voice,
      BUNWA_LANGUAGE: env.language,
      BUNWA_CALL_AUDIO_SINK: env.sink,
      PACAT_PATH: env.pacat,
      PULSE_SERVER: env.pulseServer,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await proc.exited;
}

void main();

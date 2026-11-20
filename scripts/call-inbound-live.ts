/**
 * Auto-answers an incoming WhatsApp call and starts the configured call agent.
 *
 * The default is Fish Audio. Set `BUNWA_CALL_PROVIDER=gemini` to use Gemini
 * Live instead. If the Fish bridge fails while the call is still active, the
 * script falls back to Gemini Live unless `BUNWA_CALL_FALLBACK=0`.
 *
 * Run:
 *   BUNWA_URL=... BUNWA_API_KEY=... BUNWA_SESSION=... FISH_API_KEY=... \
 *   bun run call:inbound-live
 */
import { spawn } from 'bun';

export type CallProvider = 'fish' | 'gemini';

/** Which runtime script serves the call. Exported so the choice is testable. */
export function callRuntimeScript(provider: string): { provider: CallProvider; script: string; label: string } {
  if (provider.toLowerCase() === 'gemini') {
    return { provider: 'gemini', script: 'scripts/call-live.ts', label: 'Gemini Live' };
  }
  return { provider: 'fish', script: 'scripts/fish-bridge.ts', label: 'Fish Audio' };
}

const env = {
  bunwaUrl: process.env.BUNWA_URL || 'http://127.0.0.1:3001',
  session: process.env.BUNWA_SESSION || 'calltest',
  apiKey: process.env.BUNWA_API_KEY || process.env.BUNWA_API_KEY || '',
  geminiKey: process.env.GEMINI_API_KEY || '',
  fishKey: process.env.FISH_API_KEY || '',
  fishAgentId: process.env.FISH_AGENT_ID || '76d8826773b24aecbaec1a6796f8f5e5',
  provider: process.env.BUNWA_CALL_PROVIDER || 'fish',
  fallback: process.env.BUNWA_CALL_FALLBACK !== '0',
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

function startRuntime(script: string) {
  return spawn({
    cmd: ['/opt/data/home/.bun/bin/bun', 'run', script],
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
      FISH_API_KEY: env.fishKey,
      FISH_AGENT_ID: env.fishAgentId,
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

async function activeCall(): Promise<any | null> {
  try {
    const { call } = await api('/calls/active');
    return call ?? null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`watching for an incoming call (provider: ${env.provider})`);
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

  // Start the configured call agent against the accepted call.
  const runtime = callRuntimeScript(env.provider);
  console.log(`starting ${runtime.label} call agent`);
  const primary = startRuntime(runtime.script);
  let code = await primary.exited;

  if (code !== 0 && runtime.provider === 'fish' && env.fallback) {
    const stillActive = await activeCall();
    if (stillActive) {
      console.log(`Fish Audio bridge exited ${code}; falling back to Gemini Live`);
      const fallback = startRuntime('scripts/call-live.ts');
      code = await fallback.exited;
    }
  }

  process.exitCode = code;
}

if (import.meta.main) void main();

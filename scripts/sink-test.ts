/**
 * Local check of the TTS sink path without a WhatsApp call.
 * Decodes a Fish clip, writes it through SinkWriter, and records wa_tts.monitor.
 * Run: bun run scripts/sink-test.ts
 */
import { spawn } from 'bun';
import { SinkWriter, StreamingResampler } from './call-live';

const pulseEnv = {
  ...process.env,
  PULSE_SERVER: process.env.PULSE_SERVER || 'unix:/tmp/pulse-native',
  LD_LIBRARY_PATH:
    process.env.PULSE_LD_LIBRARY_PATH ||
    '/opt/data/pulse/usr/lib/x86_64-linux-gnu:/opt/data/pulse/usr/lib/x86_64-linux-gnu/pulseaudio:/opt/data/pulse/usr/lib/pulse-17.0+dfsg1/modules:/opt/data/pulse/lib/x86_64-linux-gnu',
};
const parec = process.env.PAREC_PATH || '/opt/data/pulse/usr/bin/parec';

async function decode(path: string, rate: number): Promise<Buffer> {
  const proc = spawn(
    ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', path, '-f', 's16le', '-ar', String(rate), '-ac', '1', '-'],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const data = Buffer.from(await new Response(proc.stdout).arrayBuffer());
  const code = await proc.exited;
  if (code !== 0) throw new Error(`ffmpeg ${code}: ${await new Response(proc.stderr).text()}`);
  return data;
}

async function record(label: string, pcm: Buffer, rate: number): Promise<void> {
  const rawPath = `/opt/data/cache/scratch/${label}.raw`;
  const capture = spawn(
    ['bash', '-lc', `exec ${parec} --device=wa_tts.monitor --format=s16le --rate=48000 --channels=2 --raw > ${rawPath}`],
    { env: pulseEnv, stdout: 'ignore', stderr: 'ignore' },
  );
  await new Promise((resolve) => setTimeout(resolve, 300));

  const writer = new SinkWriter('wa_tts', rate, 0, 250);
  const chunkBytes = Math.floor(rate * 0.02) * 2;
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    await writer.write(pcm.subarray(offset, Math.min(offset + chunkBytes, pcm.length)));
  }
  await writer.close();
  await new Promise((resolve) => setTimeout(resolve, 500));

  capture.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log(`${label}: ${pcm.length} bytes written, capture ${rawPath}`);
}

const source = '/opt/data/cache/scratch/pulse_call.mp3';
const pcm16 = await decode(source, 16_000);
await record('sink_16k', pcm16, 16_000);

const pcm24 = await decode(source, 24_000);
const resampler = new StreamingResampler(24_000, 16_000);
const chunk24 = Math.floor(24_000 * 0.02) * 2;
const out: Buffer[] = [];
for (let offset = 0; offset < pcm24.length; offset += chunk24) {
  out.push(resampler.push(pcm24.subarray(offset, Math.min(offset + chunk24, pcm24.length))));
}
await record('sink_24k_resampled', Buffer.concat(out), 16_000);

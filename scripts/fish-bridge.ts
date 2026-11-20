/**
 * Fish Agents <-> BunWa bridge.
 *
 * Bun-only: Bun.serve for control, Bun.spawn for pacat, native fetch/WebSocket.
 * The only third-party dependency is @livekit/rtc-node, which is required for
 * the LiveKit WebRTC transport Fish uses.
 *
 * Audio:
 *   BunWa /calls/audio (PCM16 16 kHz) -> upsample 48 kHz -> LiveKit mic track
 *   LiveKit agent track -> 16 kHz PCM16 -> pacat -> wa_tts
 */
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  dispose,
} from '@livekit/rtc-node';
import { RuntimeRecorder } from '../src/core/agent/runtime-recorder';

const CALL_RATE = 16_000;
const LIVE_RATE = 48_000;
const FRAME_SAMPLES = 960; // 20 ms at 48 kHz

const env = {
  bunwaUrl: Bun.env.BUNWA_URL || 'http://127.0.0.1:3001',
  bunwaKey: Bun.env.BUNWA_API_KEY || '',
  bunwaSession: Bun.env.BUNWA_SESSION || 'calltest',
  /** Optional BunWa agent id: set it to light the "On call" indicator. */
  bunwaAgentId: Bun.env.BUNWA_AGENT_ID || '',
  fishKey: Bun.env.FISH_API_KEY || '',
  agentId: Bun.env.FISH_AGENT_ID || '76d8826773b24aecbaec1a6796f8f5e5',
  sink: Bun.env.BUNWA_CALL_AUDIO_SINK || 'wa_tts',
  callAudioSource: Bun.env.BUNWA_CALL_AUDIO_SOURCE || '',
  pacat: Bun.env.PACAT_PATH || '/opt/data/pulse/usr/bin/pacat',
  parecPath: Bun.env.PAREC_PATH || '/opt/data/pulse/usr/bin/parec',
  pulseServer: Bun.env.PULSE_SERVER || 'unix:/tmp/pulse-native',
  pulseLib: Bun.env.PULSE_LD_LIBRARY_PATH
    || '/opt/data/pulse/usr/lib/x86_64-linux-gnu:/opt/data/pulse/usr/lib/x86_64-linux-gnu/pulseaudio:/opt/data/pulse/usr/lib/pulse-17.0+dfsg1/modules:/opt/data/pulse/lib/x86_64-linux-gnu',
  debug: Bun.env.FISH_BRIDGE_DEBUG === '1',
  latency: Bun.env.FISH_BRIDGE_LATENCY === '1',
};

/** Stateful PCM16 resampler. Defaults to the WhatsApp 16 kHz caller rate. */
export class Upsampler {
  private previous: number | null = null;
  private position = 0;

  constructor(private readonly inputRate = CALL_RATE) {}

  push(chunk: Buffer): Buffer {
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

    const ratio = this.inputRate / LIVE_RATE;
    const out: number[] = [];
    while (this.position < input.length - 1) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      out.push(Math.round(input[index] * (1 - fraction) + input[index + 1] * fraction));
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
 * Turns arbitrary PCM48 byte chunks into exact 20 ms LiveKit frames.
 *
 * ScriptProcessor delivers 4096-sample bursts, which upsample to 12288
 * samples: 12 full frames plus a 768-sample remainder. Dropping that remainder
 * every burst punches a 16 ms hole into the caller's audio, which the agent
 * hears as choppiness. Carry it into the next push instead.
 */
export class Pcm48Framer {
  private pending = Buffer.alloc(0);

  constructor(private readonly frameSamples = FRAME_SAMPLES) {}

  push(pcm: Buffer): Buffer[] {
    if (!pcm.length) return [];
    const bytesPerFrame = this.frameSamples * 2;
    this.pending = this.pending.length ? Buffer.concat([this.pending, pcm]) : pcm;

    const frames: Buffer[] = [];
    let offset = 0;
    while (offset + bytesPerFrame <= this.pending.length) {
      frames.push(this.pending.subarray(offset, offset + bytesPerFrame));
      offset += bytesPerFrame;
    }
    if (offset > 0) {
      // Copy the remainder so a large burst buffer is not retained.
      this.pending = Buffer.from(this.pending.subarray(offset));
    }
    return frames;
  }

  get bufferedBytes(): number {
    return this.pending.length;
  }
}

/** Long-lived pacat writer for the agent's voice. */
class PacatSink {
  private proc: ReturnType<typeof Bun.spawn> | null = null;

  private ensure(): ReturnType<typeof Bun.spawn> {
    if (this.proc) return this.proc;
    const proc = Bun.spawn(
      [env.pacat, '--playback', `--device=${env.sink}`, '--format=s16le', '--rate=16000', '--channels=1', '--latency-msec=250'],
      {
        env: { ...process.env, PULSE_SERVER: env.pulseServer, LD_LIBRARY_PATH: env.pulseLib },
        stdin: 'pipe',
        stdout: 'ignore',
        stderr: 'inherit',
      },
    );
    this.proc = proc;
    proc.exited.then(() => { this.proc = null; });
    return proc;
  }

  async write(pcm: Buffer): Promise<void> {
    if (!pcm.length) return;
    const proc = this.ensure();
    const stdin = proc.stdin as any;
    if (!stdin?.write) return;
    stdin.write(pcm);
    await Promise.race([
      typeof stdin.flush === 'function' ? stdin.flush() : Promise.resolve(),
      Bun.sleep(1000),
    ]);
  }

  async close(): Promise<void> {
    const proc = this.proc;
    this.proc = null;
    if (!proc) return;
    try { (proc.stdin as any)?.end(); } catch {}
    try { proc.kill(); } catch {}
  }
}

/** Set by main() when BUNWA_AGENT_ID is configured; null when recording is off. */
export class FishBridge {
  recorder: RuntimeRecorder | null = null;

  private room: Room | null = null;
  private source: AudioSource | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private sink = new PacatSink();
  private sessionId = '';
  private stopping = false;
  private callerChunks = 0;
  private callerBytes = 0;
  private callerFrames = 0;
  private agentFrames = 0;
  private outboundQueue: Buffer[] = [];
  private framer = new Pcm48Framer();
  private callerProc: ReturnType<typeof Bun.spawn> | null = null;
  private callerSpeechAt = 0;
  private callerSpeechEndAt = 0;
  private callerActive = false;
  private latencyReported = false;

  async start(): Promise<void> {
    const response = await fetch('https://api.fish.audio/v1/agent/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.fishKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: env.agentId,
        end_user_id: `bunwa-${env.bunwaSession}`,
        timezone: 'Africa/Accra',
      }),
    });
    if (!response.ok) throw new Error(`Fish session ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const session = await response.json();
    this.sessionId = session.session_id;
    console.log('fish session', this.sessionId, 'max', session.max_duration_seconds);

    this.room = new Room();
    this.room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      console.log('agent audio track', track.sid, participant.identity);
      void this.pumpAgentAudio(track);
    });
    this.room.on(RoomEvent.Disconnected, (reason) => console.log('livekit disconnected', reason));
    this.room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
      try {
        const text = await reader.readAll();
        if (text.trim()) console.log('transcription', participantInfo.identity, JSON.stringify(text));
        // Persist real turns when BUNWA_AGENT_ID is configured: user_prod_*
        // transcriptions are the caller, agent_prod_* are the agent.
        if (text.trim() && participantInfo.identity.startsWith('user_prod_')) {
          void this.recorder?.caller(text.trim());
        }
        if (text.trim() && participantInfo.identity.startsWith('agent_prod_')) {
          void this.recorder?.reply(text.trim());
        }
      } catch (error) {
        console.log('transcription error', error instanceof Error ? error.message : error);
      }
    });

    await this.room.connect(session.livekit_url, session.token, { autoSubscribe: true });
    console.log('livekit connected');

    // Fish's agent subscribes to microphone tracks published after it joins.
    // Publishing before the agent participant exists left the track queued but
    // never drained, so the agent heard silence and hung up.
    await this.waitForAgent();
    await this.publishMicrophone();
    void this.pumpOutbound();
    if (env.callAudioSource) void this.pumpCallerMonitor();
    else void this.pumpCallerAudio();
  }

  private async waitForAgent(): Promise<void> {
    if (!this.room) return;
    const hasAgent = () =>
      [...this.room!.remoteParticipants.values()].some((participant) =>
        participant.identity.startsWith('agent_'),
      );
    if (hasAgent()) return;
    await Promise.race([
      new Promise<void>((resolve) => {
        const onJoin = () => {
          if (hasAgent()) {
            this.room!.off(RoomEvent.ParticipantConnected, onJoin);
            resolve();
          }
        };
        this.room!.on(RoomEvent.ParticipantConnected, onJoin);
      }),
      Bun.sleep(5000),
    ]);
    console.log('agent participant present');
  }

  private async publishMicrophone(): Promise<void> {
    if (!this.room) throw new Error('room not connected');
    this.source = new AudioSource(LIVE_RATE, 1);
    this.localTrack = LocalAudioTrack.createAudioTrack('caller', this.source);
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    await this.room.localParticipant!.publishTrack(this.localTrack, options);
    console.log('published caller microphone track');
  }

  private trackCaller(pcm: Buffer): void {
    if (!env.latency) return;
    const samples = Math.floor(pcm.length / 2);
    if (!samples) return;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const value = pcm.readInt16LE(i * 2);
      sum += value * value;
    }
    const rms = Math.sqrt(sum / samples);
    if (rms > 300) {
      if (!this.callerActive) {
        this.latencyReported = false;
        this.callerActive = true;
      }
      this.callerSpeechAt = Date.now();
    } else if (this.callerActive && Date.now() - this.callerSpeechAt > 300) {
      this.callerSpeechEndAt = this.callerSpeechAt;
      this.callerActive = false;
    }
  }

  private async pumpAgentAudio(track: any): Promise<void> {
    const stream = new AudioStream(track, CALL_RATE, 1);
    for await (const frame of stream) {
      if (this.stopping) break;
      this.agentFrames += 1;
      if (this.agentFrames === 1 || this.agentFrames % 100 === 0) {
        console.log('agent frames', this.agentFrames, 'samples', frame.samplesPerChannel);
      }
      const pcm = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
      let sum = 0;
      for (let i = 0; i < frame.data.length; i++) sum += frame.data[i] * frame.data[i];
      const rms = Math.sqrt(sum / Math.max(1, frame.data.length));
      if (env.debug && rms > 300) console.log('agent speech frame', this.agentFrames, 'rms', Math.round(rms));
      if (env.latency && rms > 300 && !this.callerActive && this.callerSpeechEndAt && !this.latencyReported) {
        const latency = Date.now() - this.callerSpeechEndAt;
        console.log('fish latency ms', latency);
        this.latencyReported = true;
      }
      await this.sink.write(pcm);
    }
  }

  private async pumpCallerMonitor(): Promise<void> {
    const upsampler = new Upsampler();
    while (!this.stopping) {
      try {
        // WhatsApp Web plays the remote party through Chrome into the wa_out
        // sink. Capturing that monitor is more reliable than the in-page tap,
        // which only sees the ringtone on some WhatsApp builds.
        const proc = Bun.spawn(
          [
            env.parecPath, '--device=' + env.callAudioSource,
            '--format=s16le', '--rate=16000', '--channels=1', '--raw',
            '--latency-msec=20',
          ],
          {
            stdout: 'pipe',
            stderr: 'pipe',
            env: { ...process.env, PULSE_SERVER: env.pulseServer, LD_LIBRARY_PATH: env.pulseLib },
          },
        );
        this.callerProc = proc;
        console.log('streaming caller audio from', env.callAudioSource);

        const reader = proc.stdout.getReader();
        let pending = Buffer.alloc(0);
        for (;;) {
          const { done, value } = await reader.read();
          if (done || this.stopping) break;
          pending = Buffer.concat([pending, Buffer.from(value)]);
          const chunkBytes = 3200; // 100 ms at 16 kHz mono
          while (pending.length >= chunkBytes) {
            const pcm16 = pending.subarray(0, chunkBytes);
            pending = pending.subarray(chunkBytes);
            this.trackCaller(pcm16);
            this.callerChunks += 1;
            this.callerBytes += pcm16.length;
            if (this.callerChunks === 1 || this.callerChunks % 100 === 0) {
              console.log('caller chunks', this.callerChunks, 'bytes', this.callerBytes);
            }
            this.enqueuePcm48(upsampler.push(pcm16));
          }
        }
        console.log('caller monitor ended', await proc.exited);
      } catch (error) {
        if (this.stopping) break;
        console.log('caller monitor error', error instanceof Error ? error.message : error);
      } finally {
        this.callerProc = null;
      }
      await Bun.sleep(500);
    }
  }

  private async pumpCallerAudio(): Promise<void> {
    let upsampler: Upsampler | null = null;
    let inputRate = 0;
    while (!this.stopping) {
      try {
        // Bun's fetch reader stalled after the first SSE chunk against Hono's
        // streamSSE. curl streams the same endpoint correctly; Bun.spawn keeps
        // this Bun-native and avoids another dependency.
        const proc = Bun.spawn(
          [
            'curl', '-sS', '-N',
            '-H', `X-Api-Key: ${env.bunwaKey}`,
            '-H', 'Accept: text/event-stream',
            `${env.bunwaUrl}/api/${env.bunwaSession}/calls/audio`,
          ],
          { stdout: 'pipe', stderr: 'pipe' },
        );
        this.callerProc = proc;
        console.log('streaming caller audio');

        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done || this.stopping) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            let chunk: any;
            try { chunk = JSON.parse(line.slice(5).trim()); } catch { continue; }
            if (!chunk?.data) continue;
            const pcm16 = Buffer.from(chunk.data, 'base64');
            const rate = Number(/rate=(\d+)/i.exec(String(chunk.mimeType || ''))?.[1]) || CALL_RATE;
            if (!upsampler || rate !== inputRate) {
              inputRate = rate;
              upsampler = new Upsampler(inputRate);
              console.log('caller audio rate', inputRate, 'mimeType', chunk.mimeType || 'unknown');
            }
            this.trackCaller(pcm16);
            this.callerChunks += 1;
            this.callerBytes += pcm16.length;
            if (this.callerChunks === 1 || this.callerChunks % 100 === 0) {
              console.log(
                'caller chunks',
                this.callerChunks,
                'bytes',
                this.callerBytes,
                'chunk bytes',
                pcm16.length,
                'samples',
                pcm16.length / 2,
                'rate',
                inputRate,
              );
            }
            const pcm48 = upsampler.push(pcm16);
            this.enqueuePcm48(pcm48);
          }
        }
        console.log('caller stream ended', await proc.exited);
      } catch (error) {
        if (this.stopping) break;
        console.log('caller stream error', error instanceof Error ? error.message : error);
      } finally {
        this.callerProc = null;
      }
      await Bun.sleep(1000);
    }
  }

  private enqueuePcm48(pcm: Buffer): void {
    if (!pcm.length) return;
    for (const frame of this.framer.push(pcm)) this.outboundQueue.push(frame);
    // Keep at most ~2 s of caller audio; a slow/blocked agent must not grow
    // memory without bound or stall the SSE reader.
    if (this.outboundQueue.length > 100) {
      const dropped = this.outboundQueue.length - 100;
      this.outboundQueue.splice(0, dropped);
      console.log('caller queue overflow, dropped frames', dropped, 'buffered bytes', this.framer.bufferedBytes);
    }
  }

  private async pumpOutbound(): Promise<void> {
    while (!this.stopping) {
      const frame = this.outboundQueue.shift();
      if (!frame) {
        await Bun.sleep(5);
        continue;
      }
      if (!this.source) break;
      const samples = new Int16Array(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
      this.callerFrames += 1;
      if (this.callerFrames === 1 || this.callerFrames % 100 === 0) {
        console.log('caller frames published', this.callerFrames, 'queue', this.outboundQueue.length);
      }
      const started = performance.now();
      await this.source.captureFrame(new AudioFrame(samples, LIVE_RATE, 1, FRAME_SAMPLES));
      const elapsed = performance.now() - started;
      if (elapsed > 100) console.log('captureFrame blocked', Math.round(elapsed), 'ms');
      // Keep a 20 ms cadence even when captureFrame itself blocks. Sleeping a
      // fixed 20 ms on top of capture time makes the producer fall behind and
      // the 2 s queue then drops the oldest frames.
      const wait = 20 - elapsed;
      if (wait > 0) await Bun.sleep(wait);
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    try { this.callerProc?.kill(); } catch {}
    await this.sink.close();
    if (this.localTrack) await this.localTrack.close().catch(() => {});
    if (this.room) await this.room.disconnect().catch(() => {});
    await dispose().catch(() => {});
    if (this.sessionId && env.fishKey) {
      await fetch(`https://api.fish.audio/v1/agent/sessions/${this.sessionId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.fishKey}` },
      }).catch(() => {});
    }
    console.log('bridge stopped');
  }
}

if (import.meta.main) {
  if (!env.fishKey || !env.bunwaKey) {
    console.error('FISH_API_KEY and BUNWA_API_KEY are required');
    process.exit(2);
  }
  // With BUNWA_AGENT_ID set, heartbeat "this agent is on a call" every 5 s.
  // The server prunes the state 15 s after a missed beat, so a crash never
  // leaves a stale "on call" badge behind.
  const reportActivity = (active: boolean) => {
    if (!env.bunwaAgentId) return Promise.resolve();
    return fetch(`${env.bunwaUrl}/api/agents/${env.bunwaAgentId}/activity`, {
      method: 'POST',
      headers: { 'X-Api-Key': env.bunwaKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'voice', active }),
    })
      .catch(() => {});
  };
  const activityBeat = env.bunwaAgentId
    ? setInterval(() => void reportActivity(true), 5_000)
    : null;
  if (env.bunwaAgentId) void reportActivity(true);

  // With BUNWA_AGENT_ID set, persist the real turns (messages, events, first
  // reply latency) so the analytics dashboard reflects this call.
  const recorder = new RuntimeRecorder({
    baseUrl: env.bunwaUrl,
    apiKey: env.bunwaKey,
    agentId: env.bunwaAgentId,
    contact: Bun.env.BUNWA_CALL_CONTACT || 'caller',
  });
  if (env.bunwaAgentId) await recorder.begin({ kind: 'voice', provider: 'fish' });

  const bridge = new FishBridge();
  bridge.recorder = recorder;
  await bridge.start();
  const shutdown = async () => {
    if (activityBeat) clearInterval(activityBeat);
    await bridge.stop();
    await recorder.end();
    await reportActivity(false);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log('bridge running');
}

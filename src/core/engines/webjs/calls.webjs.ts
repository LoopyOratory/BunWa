/**
 * Experimental WhatsApp Web call control.
 *
 * WhatsApp Web ships its own VoIP stack (signalling, SRTP, Opus). The public
 * whatsapp-web.js API only exposes incoming-call events and reject(), so this
 * controller drives the same internal modules the call buttons use:
 *
 *   WAWebVoipStartCall.startWAWebVoipCall(...)
 *   WAWebVoipStackInterface.getVoipStackInterface()
 *   WAWebCallCollection.lastActiveCall / isInConnectedCall
 *   WAWebWamEnumCallTermReason.ENDED_BY_USER
 *
 * Two audio paths are supported:
 *
 * 1. WebAudio injection (default): patch WAGetUserMedia.getUserMedia and feed
 *    the call a MediaStreamAudioDestinationNode.
 * 2. Virtual device (recommended, BUNWA_CALL_AUDIO_SINK=wa_out): Chrome captures
 *    from a PulseAudio remap source, and /calls/speak writes PCM into the null
 *    sink. WhatsApp sees a real microphone.
 *
 * Everything here runs inside the WhatsApp Web page. The Node side is only a
 * thin RPC layer. WhatsApp can change these private modules at any time; every
 * method fails with a clear error instead of silently doing nothing.
 */
import { spawn } from 'bun';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface CallInfo {
  id: string;
  peerJid?: string;
  isVideo: boolean;
  isGroup: boolean;
  outgoing: boolean;
  offerTime?: number;
  connected?: boolean;
}

export interface StartCallOptions {
  video?: boolean;
  waitForAnswer?: boolean;
  timeoutMs?: number;
  injectAudio?: boolean;
}

export interface CallAudioChunk {
  /** base64-encoded audio segment (WebM/Opus by default). */
  data: string;
  mimeType: string;
  at: number;
}

type AudioListener = (chunk: CallAudioChunk) => void;

export class WebJSCallController {
  private installed = false;
  private audioInstalled = false;
  private listeners = new Set<AudioListener>();
  private readonly pulseSink = process.env.BUNWA_CALL_AUDIO_SINK || '';

  constructor(
    private readonly getPage: () => any,
    private readonly logger?: { info?: Function; warn?: Function; error?: Function },
  ) {}

  private page(): any {
    const page = this.getPage();
    if (!page) throw new Error('WEBJS page is not ready');
    return page;
  }

  async install(): Promise<void> {
    const page = this.page();
    if (!this.installed) {
      await page.evaluate(installCallShims);
      this.installed = true;
    }
    if (!this.audioInstalled) {
      try {
        await page.exposeFunction('__bunwaCallAudio', (data: string, mimeType: string) => {
          const chunk: CallAudioChunk = { data, mimeType, at: Date.now() };
          for (const listener of this.listeners) {
            try {
              listener(chunk);
            } catch (err) {
              this.logger?.warn?.({ err }, 'call audio listener failed');
            }
          }
        });
      } catch (err: any) {
        // exposeFunction throws when the binding already exists (page reload).
        if (!String(err?.message || err).toLowerCase().includes('already')) {
          this.logger?.warn?.({ err }, 'could not expose call audio binding');
        }
      }
      await page.evaluate(installAudioTap);
      this.audioInstalled = true;
    }
  }

  onAudio(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * WhatsApp Web can reload the page, which drops the injected shims. Keep the
   * same controller so the exposed audio binding still points at our listeners.
   */
  async reinstall(): Promise<void> {
    this.installed = false;
    this.audioInstalled = false;
    await this.install();
  }

  async start(chatId: string, options: StartCallOptions = {}): Promise<CallInfo | null> {
    const page = this.page();
    await this.install();
    return page.evaluate(
      (target: string, video: boolean, waitForAnswer: boolean, timeout: number, injectAudio: boolean) =>
        (globalThis as any).WWebJS.startCall(target, video, waitForAnswer, timeout, injectAudio),
      chatId,
      !!options.video,
      !!options.waitForAnswer,
      options.timeoutMs ?? 60_000,
      this.pulseSink ? false : options.injectAudio !== false,
    );
  }

  async end(callId?: string): Promise<boolean> {
    const page = this.page();
    await this.install();
    return page.evaluate((id?: string) => (globalThis as any).WWebJS.endCall(id), callId);
  }

  async active(): Promise<CallInfo | null> {
    const page = this.page();
    await this.install();
    return page.evaluate(() => (globalThis as any).WWebJS.getActiveCall());
  }

  async accept(callId: string, video = false, injectAudio = true): Promise<boolean> {
    const page = this.page();
    await this.install();
    return page.evaluate(
      (id: string, v: boolean, inject: boolean) =>
        (globalThis as any).WWebJS.acceptCall(id, v, inject),
      callId,
      video,
      this.pulseSink ? false : injectAudio,
    );
  }

  async connected(callId: string): Promise<boolean> {
    const page = this.page();
    await this.install();
    return page.evaluate((id: string) => (globalThis as any).WWebJS.isCallConnected(id), callId);
  }

  async reject(): Promise<boolean> {
    const page = this.page();
    await this.install();
    return page.evaluate(() => (globalThis as any).WWebJS.rejectCall());
  }

  /**
   * Report whether this WhatsApp Web build still exposes the private modules
   * the call stack needs. Run before a live call; module names change.
   */
  async diagnostics(): Promise<Record<string, any>> {
    const page = this.page();
    await this.install();
    return page.evaluate(() => {
      const g = globalThis as any;
      const has = (name: string) => {
        try {
          return !!g.require(name);
        } catch {
          return false;
        }
      };
      return {
        webjs: !!g.WWebJS,
        shims: !!g.WWebJS?.__bunwaCallShims,
        audioTap: !!g.__bunwaAudioTap,
        modules: {
          WAWebVoipStartCall: has('WAWebVoipStartCall'),
          WAWebVoipStackInterface: has('WAWebVoipStackInterface'),
          WAWebCallCollection: has('WAWebCallCollection'),
          WAGetUserMedia: has('WAGetUserMedia'),
          WAWebQueryExistsJob: has('WAWebQueryExistsJob'),
          WAWebWidFactory: has('WAWebWidFactory'),
          WAWebWamEnumCallTermReason: has('WAWebWamEnumCallTermReason'),
          WAWebWamEnumCallFromUi: has('WAWebWamEnumCallFromUi'),
          WAWebWamEnumLobbyEntryPointType: has('WAWebWamEnumLobbyEntryPointType'),
        },
        activeCall: g.WWebJS?.getActiveCall ? g.WWebJS.getActiveCall() : null,
        callMedia: g.WWebJS?._callMedia
          ? {
              state: g.WWebJS._callMedia.context.state,
              destinations: g.WWebJS._callMedia.destinations.length,
            }
          : null,
        getUserMediaCalls: g.WWebJS?._getUserMediaCalls || [],
        lastPlaybackRms: g.WWebJS?._lastPlaybackRms ?? null,
        lastDestinationRms: g.WWebJS?._lastDestinationRms ?? null,
        lastDestinationTrack: g.WWebJS?._lastDestinationTrack ?? null,
        trackStops: g.WWebJS?._trackStops ?? 0,
        trackEvents: g.WWebJS?._trackEvents || [],
        capture: (() => {
          try {
            const capture = g.require('WAWebVoipAudioCaptureAndPlayback');
            return {
              params: capture.getCaptureParams(),
              trackLive: capture.isCurrentAudioInputTrackLive(),
              silent: capture.isCurrentAudioInputSilent(),
              adopt: g.WWebJS?._adoptResult ?? null,
              adoptError: g.WWebJS?._adoptError ?? null,
            };
          } catch (err: any) {
            return { error: String(err).slice(0, 160) };
          }
        })(),
        microphonePatched: (() => {
          try {
            return {
              module: !!g.require('WAGetUserMedia')._bunwaPatched,
              mediaDevices: !!(g.navigator?.mediaDevices?.__bunwaPatched),
            };
          } catch {
            return { module: false, mediaDevices: false };
          }
        })(),
      };
    });
  }

  /** Play a base64 audio clip into the call. Returns its duration in seconds. */
  async speak(base64: string): Promise<number> {
    if (this.pulseSink) return this.speakViaPulse(base64);
    const page = this.page();
    await this.install();
    return page.evaluate((audio: string) => (globalThis as any).WWebJS.playCallAudio(audio), base64);
  }

  /**
   * Feed the clip to the PulseAudio null sink Chrome is capturing from. This
   * is the reliable path: WhatsApp sees a real microphone device, not a
   * synthetic WebAudio track.
   */
  private async speakViaPulse(base64: string): Promise<number> {
    const audio = Buffer.from(base64, 'base64');
    if (!audio.length) throw new Error('empty audio clip');
    const file = path.join(
      os.tmpdir(),
      `bunwa-call-${Date.now()}-${Math.random().toString(16).slice(2)}.audio`,
    );
    fs.writeFileSync(file, audio, { mode: 0o600 });

    const pacat = process.env.PACAT_PATH || '/opt/data/pulse/usr/bin/pacat';
    const pulseServer = process.env.PULSE_SERVER || 'unix:/tmp/pulse-native';
    const libraryPath = process.env.PULSE_LD_LIBRARY_PATH
      || [
        '/opt/data/pulse/usr/lib/x86_64-linux-gnu',
        '/opt/data/pulse/usr/lib/x86_64-linux-gnu/pulseaudio',
        '/opt/data/pulse/usr/lib/pulse-17.0+dfsg1/modules',
        '/opt/data/pulse/lib/x86_64-linux-gnu',
      ].join(':');

    try {
      const probe = spawn(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
        { stdout: 'pipe', stderr: 'ignore' },
      );
      const duration = Number((await new Response(probe.stdout).text()).trim()) || 0;

      const proc = spawn(
        ['bash', '-lc',
          'ffmpeg -hide_banner -loglevel error -i "$AUDIO_FILE" -f s16le -ar 48000 -ac 1 - | "$PACAT" --device="$PULSE_SINK" --format=s16le --rate=48000 --channels=1'],
        {
          env: {
            ...process.env,
            PULSE_SERVER: pulseServer,
            LD_LIBRARY_PATH: libraryPath,
            AUDIO_FILE: file,
            PACAT: pacat,
            PULSE_SINK: this.pulseSink,
          },
          stdout: 'ignore',
          stderr: 'pipe',
        },
      );
      const code = await proc.exited;
      if (code !== 0) {
        const detail = await new Response(proc.stderr).text();
        throw new Error(`PulseAudio playback failed (${code}): ${detail.slice(0, 200)}`);
      }
      return duration;
    } finally {
      try { fs.unlinkSync(file); } catch {}
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Injected into the WhatsApp Web page. Keep self-contained: Puppeteer        */
/* serialises these functions, so they cannot close over Node variables.      */
/* ------------------------------------------------------------------------- */

export function installCallShims(): void {
  const g = globalThis as any;
  const W = g.WWebJS;
  if (!W) throw new Error('WWebJS is not available on this page');
  if (W.__bunwaCallShims) return;

  W.getCallStackInterface = async () =>
    g.require('WAWebVoipStackInterface').getVoipStackInterface();

  W.setupCallMediaStream = () => {
    const store = g.WWebJS;
    store._callMediaActive = true;
    if (store._callMedia && store._callMedia.context.state !== 'closed') return store._callMedia;

    const AudioContextClass = g.AudioContext || g.webkitAudioContext;
    let context: any;
    try {
      // WhatsApp call audio is 16 kHz mono (Opus/MLow, 60 ms frames). Create
      // the graph at the same rate the call engine expects; a 48 kHz track is
      // negotiated but the audio driver does not carry it.
      context = new AudioContextClass({ sampleRate: 16000 });
    } catch {
      context = new AudioContextClass();
    }
    if (context.state === 'suspended') context.resume().catch(() => undefined);
    const master = context.createGain();
    master.gain.value = 1;
    store._callMedia = { context, master, destinations: [] };
    store._getUserMediaCalls = store._getUserMediaCalls || [];
    store._trackStops = store._trackStops || 0;
    store._trackEvents = store._trackEvents || [];

    // WhatsApp stops (and may clone or disable) the microphone track when it
    // wires the call. Synthetic tracks must survive all three, or the call
    // negotiates but carries silence.
    const trackProto = g.MediaStreamTrack && g.MediaStreamTrack.prototype;
    const markTrack = (track: any) => {
      track.__bunwaInjected = true;
      try {
        const originalSettings = typeof track.getSettings === 'function'
          ? track.getSettings.bind(track)
          : () => ({});
        track.getSettings = () => ({
          ...originalSettings(),
          deviceId: 'default',
          groupId: 'default',
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        });
      } catch {
        /* best-effort */
      }
      try {
        Object.defineProperty(track, 'label', { configurable: true, value: 'Default Audio Input' });
      } catch {
        /* read-only in some builds */
      }
      try {
        track.addEventListener?.('ended', () => store._trackEvents.push('ended'));
        track.addEventListener?.('mute', () => store._trackEvents.push('mute'));
        track.addEventListener?.('unmute', () => store._trackEvents.push('unmute'));
      } catch {
        /* ignore */
      }
    };

    if (trackProto && !trackProto.__bunwaPatchedStop) {
      const originalStop = trackProto.stop;
      trackProto.__bunwaPatchedStop = true;
      trackProto.stop = function () {
        if (this.__bunwaInjected) {
          g.WWebJS._trackStops += 1;
          return;
        }
        return originalStop.call(this);
      };

      const originalClone = trackProto.clone;
      trackProto.clone = function () {
        const clone = originalClone.call(this);
        if (this.__bunwaInjected) markTrack(clone);
        return clone;
      };

      const enabledDescriptor = Object.getOwnPropertyDescriptor(trackProto, 'enabled');
      if (enabledDescriptor && enabledDescriptor.set) {
        try {
          Object.defineProperty(trackProto, 'enabled', {
            configurable: enabledDescriptor.configurable,
            enumerable: enabledDescriptor.enumerable,
            get: enabledDescriptor.get,
            set(value: boolean) {
              if (this.__bunwaInjected) {
                g.WWebJS._trackEvents.push(`enabled:${value}`);
                return;
              }
              return enabledDescriptor.set!.call(this, value);
            },
          });
        } catch {
          /* non-configurable in some builds */
        }
      }
    }

    // Every acquisition path funnels through here while injection is active:
    // the module WhatsApp normally uses, the browser API, and the legacy
    // callback form. The call stack is free to use any of them.
    const deliver = (constraints: any, source: string) => {
      const media = g.WWebJS._callMedia;
      const wantsVideo = !!(constraints && constraints.video);
      const injected = !!media && g.WWebJS._callMediaActive && !wantsVideo;
      try {
        g.WWebJS._getUserMediaCalls.push({
          source,
          constraints: JSON.stringify(constraints || {}).slice(0, 200),
          injected,
          stack: (new Error()).stack?.split('\n').slice(1, 6).join(' | ').slice(0, 500),
          at: Date.now(),
        });
        if (g.WWebJS._getUserMediaCalls.length > 50) g.WWebJS._getUserMediaCalls.shift();
      } catch {
        /* logging is best-effort */
      }
      if (!injected) return null;
      const destination = media.context.createMediaStreamDestination();
      try {
        destination.channelCount = 1;
        destination.channelCountMode = 'explicit';
      } catch {
        /* not writable in some builds */
      }
      media.master.connect(destination);
      media.destinations.push(destination);
      for (const track of destination.stream.getAudioTracks()) {
        markTrack(track);
      }
      return destination.stream;
    };

    const mediaModule = g.require('WAGetUserMedia');
    if (!mediaModule._bunwaPatched) {
      const original = mediaModule.getUserMedia;
      mediaModule._bunwaPatched = true;
      mediaModule.getUserMedia = (constraints: any) => {
        const stream = deliver(constraints, 'WAGetUserMedia');
        if (stream) return Promise.resolve(stream);
        return original(constraints);
      };
    }

    const mediaDevices = g.navigator && g.navigator.mediaDevices;
    if (mediaDevices && !mediaDevices.__bunwaPatched) {
      const original = mediaDevices.getUserMedia && mediaDevices.getUserMedia.bind(mediaDevices);
      mediaDevices.__bunwaPatched = true;
      mediaDevices.getUserMedia = (constraints: any) => {
        const stream = deliver(constraints, 'mediaDevices');
        if (stream) return Promise.resolve(stream);
        return original ? original(constraints) : Promise.reject(new Error('getUserMedia unavailable'));
      };
    }

    for (const key of ['getUserMedia', 'webkitGetUserMedia', 'mozGetUserMedia']) {
      if (typeof g.navigator?.[key] === 'function' && !g.navigator[`__bunwaPatched_${key}`]) {
        const original = g.navigator[key].bind(g.navigator);
        g.navigator[`__bunwaPatched_${key}`] = true;
        g.navigator[key] = (constraints: any, success: any, failure: any) => {
          const stream = deliver(constraints, key);
          if (stream) {
            if (success) success(stream);
            return undefined;
          }
          return original(constraints, success, failure);
        };
      }
    }

    return store._callMedia;
  };

  W.teardownCallMediaStream = () => {
    const media = g.WWebJS._callMedia;
    g.WWebJS._callMediaActive = false;
    if (!media) return;
    for (const destination of media.destinations) {
      try {
        media.master.disconnect(destination);
      } catch {
        /* already disconnected */
      }
    }
    media.destinations = [];
  };

  W.playCallAudio = async (base64: string) => {
    const { context, master } = g.WWebJS.setupCallMediaStream();
    if (context.state === 'suspended') await context.resume();

    const media = g.WWebJS._callMedia;
    const track = media?.destinations?.[0]?.stream?.getAudioTracks?.()[0];
    g.WWebJS._lastDestinationTrack = track
      ? {
          readyState: track.readyState,
          muted: track.muted,
          enabled: track.enabled,
          id: track.id,
          label: track.label,
          kind: track.kind,
          settings: typeof track.getSettings === 'function' ? track.getSettings() : null,
        }
      : null;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const buffer = await context.decodeAudioData(bytes.buffer);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(master);

    // Measure the master bus and the actual destination stream. If master has
    // signal but the destination is silent, the WebAudio connection is wrong;
    // if both have signal, WhatsApp is not consuming the track we returned.
    try {
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      const sink = context.createGain();
      sink.gain.value = 0;
      sink.__bunwaTapInternal = true;
      master.connect(analyser);
      analyser.connect(sink);
      sink.connect(context.destination);
      const samples = new Float32Array(analyser.fftSize);
      const measure = () => {
        try {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
          const rms = Math.sqrt(sum / samples.length);
          g.WWebJS._lastPlaybackRms = Math.max(g.WWebJS._lastPlaybackRms || 0, rms);
        } catch {
          /* measurement is best-effort */
        }
      };
      setTimeout(measure, 100);
      setTimeout(measure, 500);
      setTimeout(() => {
        try { master.disconnect(analyser); } catch {}
        try { analyser.disconnect(); } catch {}
        try { sink.disconnect(); } catch {}
      }, 900);

      const destinationStream = media?.destinations?.[0]?.stream;
      if (destinationStream) {
        const destAnalyser = context.createAnalyser();
        destAnalyser.fftSize = 2048;
        const destSink = context.createGain();
        destSink.gain.value = 0;
        destSink.__bunwaTapInternal = true;
        const destSource = context.createMediaStreamSource(destinationStream);
        destSource.connect(destAnalyser);
        destAnalyser.connect(destSink);
        destSink.connect(context.destination);
        const destSamples = new Float32Array(destAnalyser.fftSize);
        const measureDest = () => {
          try {
            destAnalyser.getFloatTimeDomainData(destSamples);
            let sum = 0;
            for (let i = 0; i < destSamples.length; i++) sum += destSamples[i] * destSamples[i];
            const rms = Math.sqrt(sum / destSamples.length);
            g.WWebJS._lastDestinationRms = Math.max(g.WWebJS._lastDestinationRms || 0, rms);
          } catch {
            /* measurement is best-effort */
          }
        };
        setTimeout(measureDest, 100);
        setTimeout(measureDest, 500);
        setTimeout(() => {
          try { destSource.disconnect(); } catch {}
          try { destAnalyser.disconnect(); } catch {}
          try { destSink.disconnect(); } catch {}
        }, 900);
      }
    } catch {
      /* never block playback for diagnostics */
    }

    return new Promise<number>((resolve) => {
      source.onended = () => resolve(buffer.duration);
      source.start();
    });
  };

  W.acceptCall = async (callId: string, isVideo = false, injectAudio = true) => {
    if (injectAudio) g.WWebJS.setupCallMediaStream();
    else g.WWebJS._callMediaActive = false;
    const stack = await g.WWebJS.getCallStackInterface();
    await stack.acceptCall(callId, isVideo);
    return true;
  };

  W.rejectCall = async () => {
    const stack = await g.WWebJS.getCallStackInterface();
    if (typeof stack.rejectCall !== 'function') {
      throw new Error('This WhatsApp Web build has no rejectCall controller');
    }
    await stack.rejectCall();
    g.WWebJS.teardownCallMediaStream();
    return true;
  };

  W.endCall = async (callId?: string) => {
    const stack = await g.WWebJS.getCallStackInterface();
    const { CALL_TERM_REASON } = g.require('WAWebWamEnumCallTermReason');
    const id = callId || g.WWebJS.getOngoingCall()?.id;
    await stack.endCall(id, CALL_TERM_REASON.ENDED_BY_USER);
    g.WWebJS.teardownCallMediaStream();
    return true;
  };

  W.getOngoingCall = () => {
    const call = g.require('WAWebCallCollection').lastActiveCall;
    if (!call || (typeof call.getState === 'function' && call.getState() === 0)) return null;
    return call;
  };

  W.adoptInjectedStream = async () => {
    const media = g.WWebJS.setupCallMediaStream();
    let destination = media.destinations[0];
    if (!destination) {
      destination = media.context.createMediaStreamDestination();
      try {
        destination.channelCount = 1;
        destination.channelCountMode = 'explicit';
      } catch {}
      media.master.connect(destination);
      media.destinations.push(destination);
    }
    const capture = g.require('WAWebVoipAudioCaptureAndPlayback');
    if (typeof capture.adoptGrantedMicrophoneStream !== 'function') {
      return { ok: false, reason: 'adoptGrantedMicrophoneStream missing' };
    }
    const ok = await capture.adoptGrantedMicrophoneStream(
      Promise.resolve(destination.stream),
      () => true,
    );
    return {
      ok,
      trackLive: capture.isCurrentAudioInputTrackLive(),
      silent: capture.isCurrentAudioInputSilent(),
    };
  };

  W.startCall = async (
    chatId: string,
    isVideo = false,
    waitForAnswer = false,
    timeout = 60000,
    injectAudio = true,
  ) => {
    if (injectAudio) g.WWebJS.setupCallMediaStream();
    else g.WWebJS._callMediaActive = false;

    let wid: any;
    const target = String(chatId);
    if (target.includes('@')) {
      wid = g.require('WAWebWidFactory').createWid(target);
    } else {
      const result = await g
        .require('WAWebQueryExistsJob')
        .queryPhoneExists('+' + target.replace(/\D/g, ''));
      if (!result || !result.wid) throw new Error('The provided phone number is not registered on WhatsApp');
      wid = result.wid;
    }

    // Calls not flagged as a user gesture are treated as deep links and wait
    // on a confirmation popup, so pass entryTrust the way the call button does.
    const { CALL_FROM_UI } = g.require('WAWebWamEnumCallFromUi');
    const { LOBBY_ENTRY_POINT_TYPE } = g.require('WAWebWamEnumLobbyEntryPointType');
    await g
      .require('WAWebVoipStartCall')
      .startWAWebVoipCall(
        wid,
        isVideo,
        CALL_FROM_UI.CONVERSATION,
        LOBBY_ENTRY_POINT_TYPE.NOT_OPENED,
        null,
        { entryTrust: 'user_gesture' },
      );

    g.__bunwaRetapMedia?.();

    // Only adopt an injected stream when WebAudio injection is active. In
    // PulseAudio mode the call must capture the real virtual microphone; an
    // unconditional adopt re-activates the synthetic track and silences it.
    if (injectAudio) {
      try {
        g.WWebJS._adoptResult = await g.WWebJS.adoptInjectedStream();
      } catch (err: any) {
        g.WWebJS._adoptError = String(err).slice(0, 200);
      }
    }

    const collection = g.require('WAWebCallCollection');
    let call: any = null;
    for (let i = 0; i < 30 && !call; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      call = g.WWebJS.getOngoingCall();
    }

    if (call && waitForAnswer) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const current = g.WWebJS.getOngoingCall();
        if (collection.isInConnectedCall && current && current.id === call.id) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      g.__bunwaRetapMedia?.();
    }

    return call
      ? {
          id: call.id,
          peerJid: call.peerJid?._serialized,
          isVideo: call.isVideo,
          isGroup: call.isGroup,
          outgoing: call.outgoing,
        }
      : null;
  };

  W.isCallConnected = (callId: string) => {
    const collection = g.require('WAWebCallCollection');
    return (
      collection.isInConnectedCall === true &&
      !!collection.lastActiveCall &&
      collection.lastActiveCall.id === callId
    );
  };

  W.getActiveCall = () => {
    const call = g.WWebJS.getOngoingCall();
    if (!call) return null;
    return {
      id: call.id,
      peerJid: call.peerJid?._serialized,
      offerTime: call.offerTime,
      isVideo: call.isVideo,
      isGroup: call.isGroup,
      outgoing: call.outgoing,
      connected: g.WWebJS.isCallConnected(call.id),
    };
  };

  W.__bunwaCallShims = true;
}

export function installAudioTap(): void {
  const g = globalThis as any;
  if (g.__bunwaAudioTap) return;
  g.__bunwaAudioTap = true;

  const AudioContextClass = g.AudioContext || g.webkitAudioContext;
  const AudioNodeProto = g.AudioNode && g.AudioNode.prototype;
  if (!AudioContextClass || !AudioNodeProto || !AudioNodeProto.connect) return;

  // One ScriptProcessor per AudioContext. It captures the remote audio as raw
  // PCM16, so consumers do not have to deal with headerless WebM timeslice
  // chunks (MediaRecorder only puts the EBML header in the first chunk).
  const taps = new WeakMap<object, { processor: any; mute: any }>();

  const ensureTap = (context: any) => {
    const existing = taps.get(context);
    if (existing) return existing;

    const processor = context.createScriptProcessor(4096, 1, 1);
    const mute = context.createGain();
    mute.gain.value = 0;
    // Mark both so the connect patch does not tap its own plumbing.
    processor.__bunwaTapInternal = true;
    mute.__bunwaTapInternal = true;

    processor.onaudioprocess = (event: any) => {
      try {
        const input = event.inputBuffer;
        const channel = input.getChannelData(0);
        const pcm = new Int16Array(channel.length);
        for (let i = 0; i < channel.length; i++) {
          const sample = Math.max(-1, Math.min(1, channel[i]));
          pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        const bytes = new Uint8Array(pcm.buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        g.__bunwaCallAudio?.(
          btoa(binary),
          `audio/pcm;rate=${context.sampleRate};channels=1`,
        );
      } catch {
        /* never break the call graph */
      }
    };

    processor.connect(mute);
    mute.connect(context.destination);

    const state = { processor, mute };
    taps.set(context, state);
    return state;
  };

  const originalConnect = AudioNodeProto.connect;
  AudioNodeProto.connect = function (destination: any, ...rest: any[]) {
    try {
      if (!this.__bunwaTapInternal && destination && this.context && destination === this.context.destination) {
        const tap = ensureTap(this.context);
        originalConnect.call(this, tap.processor, ...rest);
      }
    } catch {
      /* never break WhatsApp's own graph */
    }
    return originalConnect.call(this, destination, ...rest);
  };

  // Some WhatsApp builds play remote audio through an <audio> element.
  const proto = g.HTMLMediaElement && g.HTMLMediaElement.prototype;
  const attachStream = (stream: any) => {
    try {
      if (!stream || stream.__bunwaTapped) return;
      stream.__bunwaTapped = true;
      const context = g.__bunwaTapContext || (g.__bunwaTapContext = new AudioContextClass());
      void context.resume?.().catch?.(() => {});
      const source = context.createMediaStreamSource(stream);
      source.connect(ensureTap(context).processor);
    } catch {
      /* ignore */
    }
  };
  const attachMedia = (element: any) => {
    try {
      if (!element || !element.srcObject) return;
      attachStream(element.srcObject);
    } catch {
      /* ignore */
    }
  };
  // WhatsApp's WebRTC receiver is the authoritative remote audio source.
  // Tapping the peer connection's audio track works even when headless Chrome
  // does not route playback to a PulseAudio sink.
  const OriginalPC = g.RTCPeerConnection;
  if (OriginalPC && !OriginalPC.__bunwaPatched) {
    const pcProto = OriginalPC.prototype;
    const attachEvent = (event: any) => {
      try {
        const stream = event?.streams?.[0] || (event?.track ? new g.MediaStream([event.track]) : null);
        if (stream) attachStream(stream);
      } catch {
        /* ignore */
      }
    };
    // Existing peer connections created before this tap set ontrack or call
    // addEventListener('track') when the call starts, so wrap both paths.
    const trackDescriptor = pcProto && Object.getOwnPropertyDescriptor(pcProto, 'ontrack');
    if (trackDescriptor && trackDescriptor.set) {
      Object.defineProperty(pcProto, 'ontrack', {
        configurable: trackDescriptor.configurable,
        enumerable: trackDescriptor.enumerable,
        get: trackDescriptor.get,
        set(handler: any) {
          if (typeof handler !== 'function' || handler.__bunwaTapWrapped) {
            return trackDescriptor.set!.call(this, handler);
          }
          const wrapped = (event: any) => {
            attachEvent(event);
            return handler.call(this, event);
          };
          wrapped.__bunwaTapWrapped = true;
          return trackDescriptor.set!.call(this, wrapped);
        },
      });
    }
    const originalAddEventListener = pcProto?.addEventListener;
    if (typeof originalAddEventListener === 'function') {
      pcProto.addEventListener = function (type: string, listener: any, ...rest: any[]) {
        if (type === 'track' && typeof listener === 'function' && !listener.__bunwaTapWrapped) {
          const wrapped = (event: any) => {
            attachEvent(event);
            return listener.call(this, event);
          };
          wrapped.__bunwaTapWrapped = true;
          return originalAddEventListener.call(this, type, wrapped, ...rest);
        }
        return originalAddEventListener.call(this, type, listener, ...rest);
      };
    }
    (OriginalPC as any).__bunwaPatched = true;
  }
  // WhatsApp often creates the call's <audio> element and assigns srcObject
  // before this tap is installed, so the srcObject setter never fires for the
  // live call. Scan existing elements and catch play() as a second chance.
  g.__bunwaRetapMedia = () => {
    try {
      for (const element of g.document.querySelectorAll('audio,video')) attachMedia(element);
    } catch {
      /* ignore */
    }
  };
  g.__bunwaRetapMedia();
  const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'srcObject');
  if (descriptor && descriptor.set) {
    Object.defineProperty(proto, 'srcObject', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value: any) {
        try {
          if (value) attachStream(value);
        } catch {
          /* ignore */
        }
        return descriptor.set!.call(this, value);
      },
    });
  }
  if (proto && typeof proto.play === 'function') {
    const originalPlay = proto.play;
    proto.play = function (...args: any[]) {
      attachMedia(this);
      return originalPlay.apply(this, args);
    };
  }
}

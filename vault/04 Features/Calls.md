# WhatsApp Calls

Status: **experimental**, WEBJS engine only.

WhatsApp Web ships a complete VoIP stack — signalling, SRTP, Opus, relay
selection — compiled to WebAssembly. `whatsapp-web.js` only exposes incoming
call events and `reject()`. BunWa drives the same private modules the call
buttons use, so the call itself is a real WhatsApp call; nothing is reimplemented.

## What is wired

- `POST /api/{session}/calls/start` — place a 1:1 voice (or video) call
- `POST /api/{session}/calls/end` — hang up
- `GET  /api/{session}/calls/active` — current call or null
- `GET  /api/{session}/calls/diagnostics` — check the private modules exist
- `POST /api/{session}/calls/accept` — answer an incoming call
- `POST /api/{session}/calls/speak` — inject a base64 audio clip (TTS)
- `GET  /api/{session}/calls/audio` — SSE stream of the remote party's audio
- MCP: `CallStart`, `CallEnd`, `CallActive`, `CallDiagnostics`, `CallSpeak`
- Webhook: `call.received` for incoming calls

## The reverse-engineered surface

| Purpose | WhatsApp Web module |
|---|---|
| Start a call | `WAWebVoipStartCall.startWAWebVoipCall(wid, isVideo, CALL_FROM_UI.CONVERSATION, LOBBY_ENTRY_POINT_TYPE.NOT_OPENED, null, { entryTrust: 'user_gesture' })` |
| Call state | `WAWebCallCollection.lastActiveCall`, `.isInConnectedCall` |
| Answer / hang up | `WAWebVoipStackInterface.getVoipStackInterface().acceptCall(id, isVideo)` / `.endCall(id, CALL_TERM_REASON.ENDED_BY_USER)` |
| Resolve a phone number | `WAWebQueryExistsJob.queryPhoneExists('+233...')` |
| Build a JID | `WAWebWidFactory.createWid('233...@c.us')` |
| Outgoing audio (recommended) | PulseAudio null sink `wa_out` + remap source `wa_mic`; `/calls/speak` pipes decoded PCM into `wa_out`, Chrome captures `wa_mic` |
| Outgoing audio (fallback) | patch `WAGetUserMedia.getUserMedia` to return a `MediaStreamDestination` fed by WebAudio |
| Tap remote audio | observe `AudioNode.connect` when the destination is `AudioContext.destination`; tee the branch into a `ScriptProcessor` and emit PCM16 |

The `entryTrust: 'user_gesture'` argument matters. Without it WhatsApp treats
the call as a deep link and waits on a "Start a WhatsApp call?" confirmation
that never resolves in an automated browser.

## Audio path

WhatsApp's capture driver reports `getCaptureParams()` as **16 kHz mono, 320
samples per chunk (20 ms)**. A synthetic `MediaStreamDestination` track is
reported as `trackLive: false, silent: true`, so the callee hears nothing even
though the graph has signal. The reliable path is a virtual input device:

```
TTS (Node) ──base64──► /calls/speak ──► ffmpeg ──► pacat ──► wa_tts (TTS sink)
                                                                  │
                                                        wa_tts.monitor
                                                                  │
                                                        wa_mic (remap source)
                                                                  │
                                              Chrome / WhatsApp capture (16 kHz)
                                                                  │
                                                            WhatsApp Opus/RTP

Chrome call playback ──────────────────────────────────────► wa_out (separate sink)
```

The two sinks are deliberately separate. If Chrome's call playback and the TTS
share one sink, `wa_mic` captures the caller's voice and the agent's own output,
which makes the model hear itself, interrupts its turn, and sounds choppy.

`scripts/pulseaudio-call-device.sh` starts the server, creates both sinks and the
source, and prints the environment BunWa needs. Run it once per host:

```bash
bun run call:audio-device
PULSE_SERVER=unix:/tmp/pulse-native \
BUNWA_CALL_AUDIO_SINK=wa_tts \
PACAT_PATH=/opt/data/pulse/usr/bin/pacat \
bun run start
```

`/calls/speak` chooses the PulseAudio path whenever `BUNWA_CALL_AUDIO_SINK` is
set; otherwise it falls back to the WebAudio injection path. With the virtual
device, WhatsApp sees a real microphone, so `injectAudio` is forced off.

The remote tap is unchanged: it observes `AudioNode.connect(destination)` and
tees the branch into a `ScriptProcessor` that emits PCM16 over SSE.

## Low-latency live agent (Gemini Live)

The turn-based loop below costs ~4.2 s to first audio on this host: STT 1.5 s,
LLM 0.7 s, Fish TTS 0.5 s to first byte plus playback. `scripts/call-live.ts`
removes the pipeline:

```bash
BUNWA_URL=http://127.0.0.1:3001 BUNWA_SESSION=calltest \
BUNWA_API_KEY=... GEMINI_API_KEY=... \
BUNWA_CALL_AUDIO_SINK=wa_tts \
bun run call:live
```

- Caller PCM16 goes continuously into `gemini-3.8-live` over a WebSocket.
- Model audio (24 kHz) is resampled to the call's 16 kHz with a **stateful**
  resampler; stateless per-chunk resampling resets phase and sounds choppy.
- `pacat` runs with a 250 ms buffer and no custom pacing, so the sink does not
  underrun between model chunks.
- `interrupted` from the model flushes queued audio (barge-in).
- The SSE reader reconnects after a call ends or the gateway restarts instead
  of crashing with `ECONNRESET`.

Measured on this host: setup 0.23 s, first audio 0.82 s for a text turn. Input
and output transcripts stream in the console.

## Fish Agents bridge (Bun)

Fish Agents speaks LiveKit/WebRTC, not raw PCM. `scripts/fish-bridge.ts` bridges
a BunWa call to a Fish agent:

```
BunWa /calls/audio (PCM16 16 kHz)
        │  upsample 48 kHz
        ▼
LiveKit mic track ──► Fish agent
LiveKit agent track ──► 16 kHz PCM16 ──► pacat ──► wa_tts
```

Run it with Bun only:

```bash
BUNWA_URL=http://127.0.0.1:3001 BUNWA_SESSION=calltest \
BUNWA_API_KEY=... FISH_API_KEY=... FISH_AGENT_ID=... \
BUNWA_CALL_AUDIO_SINK=wa_tts \
bun run call:fish
```

The only third-party dependency is `@livekit/rtc-node`; HTTP, SSE, process
spawning, files and env loading are Bun built-ins (`Bun.serve`, `Bun.spawn`,
`Bun.file`, `Bun.env`, `Bun.sleep`).

The bridge reconnects its BunWa SSE reader when a call ends or the gateway
restarts. It ends the Fish session on `SIGINT`/`SIGTERM`. The agent must be
published; the session token is single-use and expires quickly.

Fish also offers **native WhatsApp Business Calling** (Meta app + WABA number →
Fish answers inbound calls directly). That path needs no bridge and no Bun
code, but requires a Meta app, a Cloud API number and Business Verification.
The bridge above is for the existing BunWa linked-device session.

### Inbound auto-answer

`scripts/call-inbound-live.ts` watches `/calls/active`, accepts an incoming
call, then starts the configured agent. **Fish Audio is the default.** Gemini
Live is opt-in:

```bash
# Fish (default)
BUNWA_CALL_PROVIDER=fish bun run call:inbound-live

# Gemini Live
BUNWA_CALL_PROVIDER=gemini bun run call:inbound-live
```

If the Fish bridge exits non-zero while the call is still active, the script
falls back to Gemini Live. Set `BUNWA_CALL_FALLBACK=0` to disable that.

Required environment:

- `BUNWA_API_KEY` (or `WAHA_API_KEY`)
- `FISH_API_KEY` and `FISH_AGENT_ID` for the default Fish path
- `GEMINI_API_KEY` for the Gemini path or fallback

### Measured live latency (2026-11-18)

Speech-to-speech, measured from the end of the caller's question to the first
agent audio frame. Same question audio for both paths.

- **Google Live** (`gemini-3.8-live`, direct WebSocket, n=5):
  median **1046 ms**, average **1032 ms**, range **940–1147 ms**, setup **227 ms**.
- **Fish Agents** (hosted agent via LiveKit bridge, n=6):
  median **741 ms**, average **858 ms**, range **309–1699 ms**.

Fish is faster at the median in this sample, but its turn-taking is less
consistent. The Fish figure includes the LiveKit bridge and the BunWa audio
path, so the hosted agent itself is at or below that number. Google is tighter
and more predictable. Re-measure before quoting these as production SLAs.

Run the Google side with:

```bash
bun run call:live-latency /path/to/question.pcm 5
```

Run the Fish side with `FISH_BRIDGE_LATENCY=1` on `bun run call:fish`; it logs
`fish latency ms` for each measured turn.

## Live conversation loop

BunWa stays a media gateway; the intelligence can live in Hermes, n8n or any
service. A reference agent is included:

```bash
BUNWA_URL=http://127.0.0.1:3001 \
WAHA_API_KEY=... SESSION=calltest \
GEMINI_API_KEY=... FISH_API_KEY=... \
bun run call:agent
```

`scripts/call-agent.ts` opens `/calls/audio`, resamples the raw PCM16 stream to
16 kHz, runs an energy VAD, transcribes each utterance with Gemini, generates a
short reply, synthesises it with Fish and posts it to `/calls/speak`. It is
half-duplex: it drops incoming audio while the agent is speaking. The SSE
decoder, resampler, WAV wrapper and VAD have unit tests; the provider calls need
real keys and a live call.

1. `GET /calls/audio` — read SSE chunks.
2. Resample PCM16 to 16 kHz and run STT (Gemini, Whisper, Soniox).
3. Generate the reply.
4. TTS to MP3/OGG.
5. `POST /calls/speak` with base64 audio.
6. Repeat on the next final transcript.

This is turn-based, roughly 1.5–4 s from end of speech to first audio, depending
on STT/LLM/TTS. Full-duplex barge-in needs a realtime model (Gemini Live or
OpenAI Realtime) and a streaming audio bridge; the current `/speak` path plays
whole clips.

## Limits and risks

- **WEBJS only.** NOWEB (Baileys) has no call engine; the routes answer 501.
- **1:1 voice** is the tested path. Group calls and video are exposed by the
  private API but not validated here.
- **Private modules can change without notice.** Every method fails loudly when
  a module is missing; messaging keeps working.
- **Unofficial client.** WhatsApp's Terms prohibit unofficial clients. Calls
  increase the detection surface. Use a number you can afford to lose.
- **Audio tap.** The tap attaches to the WebRTC receiver's remote `ontrack`
  stream, not to `AudioContext.destination`. Headless Chromium does not route
  call playback to a PulseAudio sink, so `wa_out.monitor` is silent even while
  the call is connected; `ontrack` is the authoritative source. The destination
  tap remains as a fallback for builds that use WebAudio playback.
- **No live validation in this workspace.** The code typechecks and the
  controller has unit tests with a mocked page; a real call needs a linked
  WEBJS session and a consenting callee.
- **Headless audio.** Puppeteer adds `--mute-audio` to its default headless
  arguments; it is excluded with `ignoreDefaultArgs: ['--mute-audio']` and the
  app's own flag list no longer adds it. `--autoplay-policy=no-user-gesture-required`
  and `--use-fake-ui-for-media-stream` stay.

## Alternatives

- `SheIITear/baileys-caller` — runs WhatsApp's WASM VoIP stack on top of
  Baileys, exposes remote audio as 16 kHz `Float32Array`, outbound 1:1 only.
  Better fit for raw PCM and a NOWEB-native call engine, but it opens its own
  Baileys socket.
- `wavoip/voice-calls-baileys` — relays signalling to Wavoip's infrastructure;
  requires a token and a patched Baileys 7.0.0-rc13.
- WhatsApp Business Calling API — official, Ghana-eligible for
  business-initiated calls, but a separate Cloud API number and WebRTC media
  endpoint, not a WhatsApp Web session.

## Verification

`bun run verify:calls` loads the injected functions in Chromium with mocked
`WAWeb*` modules, places a fake call, injects a 0.2 s WAV, ends the call and
checks that the audio tap produces PCM16 chunks. It does not contact WhatsApp.

`bun run verify:call-tap` loads `installAudioTap()` in Chromium, creates a
synthetic WebRTC audio call between two `RTCPeerConnection`s, and checks that
the remote `ontrack` stream produces PCM16 chunks. Last run: **13 chunks /
106,509 bytes** — the receiver tap works without a WhatsApp call.

Last run: `PASS: call shims and audio tap work in Chromium` — start, active,
playAudio (0.2 s), connected, end and 7 PCM chunks.

A live call to a consenting number has also been placed from a WEBJS session:
the call registered, a 7.7 s TTS clip played through the injected microphone
path, the tap emitted 40 chunks, and the call ended cleanly. That run used the
old MediaRecorder tap; the PCM tap is verified in Chromium and awaits its first
live call.

The controller and agent helpers have unit tests in
`src/__tests__/calls-webjs.test.ts` and `src/__tests__/call-agent.test.ts` (9).

## References

- whatsapp-web.js PR #201825 — call answering, outgoing calls, audio injection
- whatsapp-web.js PR #201881 — call controls and group participants
- WPPConnect `startWAWebVoipCall.ts`
- "Reverse engineering WhatsApp calls" — WASM loader, raw `CB:call` stanzas,
  WAP encoding, encrypted call keys, relay I/O

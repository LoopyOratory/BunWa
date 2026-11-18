#!/usr/bin/env bash
# Start the PulseAudio virtual microphone used by BunWa calls.
#
# WhatsApp Web captures call audio from a real input device. A synthetic
# MediaStreamDestination track is reported as silent by its capture driver, so
# we expose a null sink and a remap source instead:
#
#   TTS -> pacat -> wa_out (null sink) -> wa_out.monitor -> wa_mic (source)
#                                                              |
#                                              Chrome / WhatsApp capture
#
# The PulseAudio binaries live outside the distro package tree in this image
# (no root). Override PULSE_ROOT if yours are installed normally.
set -euo pipefail

PULSE_ROOT="${PULSE_ROOT:-/opt/data/pulse}"
PULSE_SOCKET="${PULSE_SOCKET:-/tmp/pulse-native}"
PULSE_RUNTIME_PATH="${PULSE_RUNTIME_PATH:-/opt/data/pulse/runtime}"
PULSE_SINK="${PULSE_SINK:-wa_out}"
PULSE_TTS_SINK="${PULSE_TTS_SINK:-wa_tts}"
PULSE_SOURCE="${PULSE_SOURCE:-wa_mic}"
LOG_FILE="${PULSE_LOG:-/opt/data/pulse/pulseaudio.log}"

PULSEAUDIO="$PULSE_ROOT/usr/bin/pulseaudio"
PACTL="$PULSE_ROOT/usr/bin/pactl"
MODULE_ROOT="$(find "$PULSE_ROOT/usr/lib" -maxdepth 1 -type d -name 'pulse-*' | head -1)"
MODULES="$MODULE_ROOT/modules"

if [ ! -x "$PULSEAUDIO" ] || [ ! -x "$PACTL" ] || [ ! -d "$MODULES" ]; then
  echo "PulseAudio not found under $PULSE_ROOT (need pulseaudio + pactl + modules)" >&2
  exit 1
fi

export LD_LIBRARY_PATH="$PULSE_ROOT/usr/lib/x86_64-linux-gnu:$PULSE_ROOT/usr/lib/x86_64-linux-gnu/pulseaudio:$MODULES:$PULSE_ROOT/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export PULSE_RUNTIME_PATH
mkdir -p "$PULSE_RUNTIME_PATH" "$(dirname "$LOG_FILE")"

if PULSE_SERVER="unix:$PULSE_SOCKET" "$PACTL" info >/dev/null 2>&1; then
  echo "PulseAudio already running on $PULSE_SOCKET"
else
  rm -f "$PULSE_SOCKET"
  "$PULSEAUDIO" -n --daemonize=no --exit-idle-time=-1 --disallow-exit \
    -L "$MODULES/module-native-protocol-unix.so socket=$PULSE_SOCKET auth-anonymous=1" \
    -L "$MODULES/module-null-sink.so sink_name=$PULSE_SINK sink_properties=device.description=BunWaPlayback" \
    -L "$MODULES/module-null-sink.so sink_name=$PULSE_TTS_SINK sink_properties=device.description=BunWaTTS" \
    -L "$MODULES/module-remap-source.so master=$PULSE_TTS_SINK.monitor source_name=$PULSE_SOURCE source_properties=device.description=BunWaCallMic" \
    -L "$MODULES/module-always-sink.so" \
    >"$LOG_FILE" 2>&1 &

  for _ in $(seq 1 50); do
    if PULSE_SERVER="unix:$PULSE_SOCKET" "$PACTL" info >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
fi

PULSE_SERVER="unix:$PULSE_SOCKET" "$PACTL" set-default-sink "$PULSE_SINK" >/dev/null
PULSE_SERVER="unix:$PULSE_SOCKET" "$PACTL" set-default-source "$PULSE_SOURCE" >/dev/null

cat <<EOF
PulseAudio call device ready.
  PULSE_SERVER=unix:$PULSE_SOCKET
  BUNWA_CALL_AUDIO_SINK=$PULSE_TTS_SINK
  PACAT_PATH=$PULSE_ROOT/usr/bin/pacat
  PULSE_LD_LIBRARY_PATH=$LD_LIBRARY_PATH
EOF

/**
 * Audio helpers for voice-note handling.
 *
 * WhatsApp voice notes must be OGG/Opus. Callers materialize arbitrary input
 * (URL, base64, data URL, or Buffer) into raw bytes, then check whether the
 * bytes are already OGG/Opus before invoking the (ffmpeg-backed) converter.
 */
import { Buffer } from 'buffer';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { unlink } from 'fs/promises';
import { resolveAndPinFetch } from '../../common/security/ssrf-guard';

/**
 * Turn a file input into a Buffer of raw bytes.
 * Accepts: a Buffer, an http(s) URL, a data URL, or a bare base64 string.
 */
export async function materializeAudioBytes(file: Buffer | string): Promise<Buffer> {
  if (Buffer.isBuffer(file)) {
    return file;
  }
  if (typeof file !== 'string') {
    throw new Error('Unsupported audio input: expected a URL, base64 string, or Buffer');
  }
  if (/^https?:\/\//i.test(file)) {
    const res = await resolveAndPinFetch(file);
    if (!res.ok) {
      throw new Error(`Failed to fetch audio from URL (${res.status} ${res.statusText})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  // data URL ("data:audio/mpeg;base64,....") or a bare base64 string
  const base64 = file.includes(',') ? file.split(',')[1] : file;
  return Buffer.from(base64, 'base64');
}

/**
 * Detect whether the bytes are already an OGG-contained Opus stream, so we can
 * skip transcoding. OGG pages start with the "OggS" capture pattern, and an
 * Opus logical stream begins with an "OpusHead" identification header.
 */
export function isOggOpus(buf: Buffer): boolean {
  if (buf.length < 4 || buf.toString('ascii', 0, 4) !== 'OggS') {
    return false;
  }
  // The OpusHead magic appears in the first OGG page (well within the first 1 KB).
  return buf.indexOf('OpusHead', 0, 'ascii') !== -1;
}

/**
 * Duration (in seconds) of an audio buffer, via ffprobe (bundled with the
 * ffmpeg apt package on Debian/Ubuntu — the base image for both Dockerfiles —
 * so no extra dependency is needed beyond what voice transcoding already
 * requires).
 *
 * Baileys can compute this itself for ptt messages it doesn't already have a
 * `seconds` value for (via the music-metadata package, parsing a temp file it
 * writes internally), but that's a best-effort step wrapped in a catch-and-warn
 * — if it fails or returns an unusable value, the resulting message is sent
 * without a duration. Chat still shows/plays the voice note fine without one,
 * but WhatsApp's Status viewer UI needs a duration to render an audio status's
 * progress bar at all, so an audio status can silently fail to display while
 * the underlying send still reports success. Computing it ourselves up front
 * removes that dependency on Baileys' auto-detection for both send paths.
 *
 * Returns undefined (never throws) if ffprobe is unavailable or the buffer
 * can't be probed — callers should treat that as "let Baileys try instead",
 * not as a fatal error.
 */
export async function getAudioDurationSeconds(buf: Buffer): Promise<number | undefined> {
  const inputPath = join(tmpdir(), `bunwa-probe-${randomBytes(8).toString('hex')}`);
  await Bun.write(inputPath, buf);
  try {
    const proc = Bun.spawn(
      [
        'ffprobe',
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        inputPath,
      ],
      { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' },
    );
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      return undefined;
    }
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : undefined;
  } catch {
    return undefined;
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

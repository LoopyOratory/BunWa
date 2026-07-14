/**
 * Audio helpers for voice-note handling.
 *
 * WhatsApp voice notes must be OGG/Opus. Callers materialize arbitrary input
 * (URL, base64, data URL, or Buffer) into raw bytes, then check whether the
 * bytes are already OGG/Opus before invoking the (ffmpeg-backed) converter.
 */
import { Buffer } from 'buffer';

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
    const res = await fetch(file);
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

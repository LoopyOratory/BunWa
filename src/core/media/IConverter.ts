import { Buffer } from 'buffer';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { unlink } from 'fs/promises';

export interface IMediaConverter {
  voice(content: Buffer): Promise<Buffer>;
  video(content: Buffer): Promise<Buffer>;
}

/**
 * Run ffmpeg over an input buffer, returning stdout as a Buffer.
 *
 * The input is written to a temp file (rather than piped to stdin) because some
 * containers ffmpeg needs to seek — piping stdin fails for those. Output is read
 * from stdout, which is fine for the streamable OGG we produce.
 */
async function runFfmpeg(input: Buffer, argsAfterInput: string[]): Promise<Buffer> {
  const inputPath = join(tmpdir(), `bunwa-${randomBytes(8).toString('hex')}`);
  await Bun.write(inputPath, input);
  try {
    const spawnFfmpeg = () =>
      Bun.spawn(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', inputPath, ...argsAfterInput, 'pipe:1'],
        { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' } as const,
      );

    let proc: ReturnType<typeof spawnFfmpeg>;
    try {
      proc = spawnFfmpeg();
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        throw new Error(
          'ffmpeg is not installed in this environment — voice transcoding is unavailable. ' +
          'Add ffmpeg to the image, send an OGG/Opus file, or use sendFile for a plain audio attachment.',
        );
      }
      throw e;
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout as ReadableStream<Uint8Array>).arrayBuffer(),
      new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(`ffmpeg failed (exit ${exitCode}): ${stderr.trim().slice(0, 500)}`);
    }
    return Buffer.from(stdout);
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

/**
 * ffmpeg-backed media converter.
 *
 * Requires the `ffmpeg` binary on PATH (added to the production Docker images).
 * If it is missing, voice()/video() throw a clear, actionable error.
 */
export class CoreMediaConverter implements IMediaConverter {
  async voice(content: Buffer): Promise<Buffer> {
    // WhatsApp voice notes: Opus in an OGG container, mono, 48 kHz.
    return runFfmpeg(content, [
      '-vn',
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-ar', '48000',
      '-ac', '1',
      '-f', 'ogg',
    ]);
  }

  async video(content: Buffer): Promise<Buffer> {
    // Not implemented yet — voice is the immediate need.
    throw new Error('Video conversion not available in Core version');
  }
}

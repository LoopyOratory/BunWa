import { Buffer } from 'buffer';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { unlink } from 'fs/promises';
import { UnprocessableEntityException } from '../exceptions';

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
        // A caller-supplied file the environment cannot convert is a client
        // facing result, not a server fault: answer 422 with the fix.
        throw new UnprocessableEntityException(
          'ffmpeg is not installed in this environment, so media conversion is unavailable. ' +
          'Add ffmpeg to the image, or send a file that is already in the target format ' +
          '(OGG/Opus for voice, H.264/AAC MP4 for video).',
        );
      }
      throw e;
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      (new Response(proc.stdout) as any).arrayBuffer(),
      (new Response(proc.stderr) as any).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      // The input could not be decoded or encoded: the file is the problem.
      throw new UnprocessableEntityException(
        `ffmpeg could not convert the supplied file (exit ${exitCode}): ${stderr.trim().slice(0, 500)}`,
      );
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
    // The format WhatsApp plays everywhere: H.264 (baseline) + AAC in MP4.
    // Output goes to a pipe, which cannot be seeked, so the MP4 is written
    // fragmented with the index up front instead of `+faststart`.
    return runFfmpeg(content, [
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-level', '3.1',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast',
      '-crf', '28',
      // Even dimensions are required by yuv420p.
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
    ]);
  }
}

import 'reflect-metadata';
import { describe, it, expect, mock } from 'bun:test';

// A caller-supplied file URL the remote host refuses is a client facing result,
// not a server fault. Before this, a 404 from the file host surfaced as a bare
// 500 "Internal server error" with no hint at the cause, and a missing ffmpeg
// did the same even though the converter had an actionable message ready.

mock.module('../common/security/ssrf-guard', () => ({
  resolveAndPinFetch: mock(async () =>
    new Response('not found', { status: 404, statusText: 'Not Found' }),
  ),
}));

const { fetchBuffer } = await import('../utils/fetch');
const { materializeAudioBytes } = await import('../core/media/audio');
const { UnprocessableEntityException } = await import('../core/exceptions');
const { globalErrorHandler } = await import('../middleware/error-handler');

describe('remote file errors are client facing', () => {
  it('fetchBuffer answers a 422 naming the status, not a 500', async () => {
    let caught: unknown;
    try {
      await fetchBuffer('https://files.example.com/missing.pdf');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect((caught as Error).message).toContain('HTTP 404');
  });

  it('materializeAudioBytes answers the same way for an audio URL', async () => {
    let caught: unknown;
    try {
      await materializeAudioBytes('https://files.example.com/missing.ogg');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect((caught as Error).message).toContain('HTTP 404');
  });

  it('the global handler maps it to a 422 with the message intact', async () => {
    const c: any = {
      json: (body: unknown, status: number) => ({ body, status }),
    };
    const res: any = globalErrorHandler(
      new UnprocessableEntityException('ffmpeg is not installed in this environment'),
      c,
    );
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('ffmpeg is not installed');
  });
});

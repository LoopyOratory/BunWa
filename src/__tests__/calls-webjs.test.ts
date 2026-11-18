import { describe, it, expect } from 'bun:test';
import { WebJSCallController } from '../core/engines/webjs/calls.webjs';

function fakePage() {
  const calls: Array<{ name: string; args: any[] }> = [];
  let audioBinding: ((data: string, mime: string) => void) | undefined;

  const page = {
    calls,
    evaluate: async (fn: Function, ...args: any[]) => {
      const source = fn.toString();
      if (source.includes('WAWebVoipStartCall: has')) {
        return {
          webjs: true,
          shims: true,
          audioTap: true,
          modules: { WAWebVoipStartCall: true, WAWebVoipStackInterface: true },
          activeCall: null,
        };
      }
      const label = fn.name || (
        source.includes('WWebJS.startCall') ? 'startCall'
          : source.includes('WWebJS.endCall') ? 'endCall'
            : source.includes('WWebJS.getActiveCall') ? 'getActiveCall'
              : source.includes('WWebJS.playCallAudio') ? 'playCallAudio'
                : source.includes('WWebJS.acceptCall') ? 'acceptCall'
                  : 'anonymous'
      );
      calls.push({ name: label, args });
      if (fn.name === 'installCallShims' || fn.name === 'installAudioTap') return undefined;
      if (label === 'startCall') {
        return { id: 'call-1', peerJid: '233201234567@c.us', isVideo: false, isGroup: false, outgoing: true };
      }
      if (label === 'getActiveCall') {
        return { id: 'call-1', peerJid: '233201234567@c.us', isVideo: false, isGroup: false, outgoing: true };
      }
      if (label === 'playCallAudio') return 3.5;
      return true;
    },
    exposeFunction: async (name: string, cb: (data: string, mime: string) => void) => {
      if (name === '__bunwaCallAudio') audioBinding = cb;
    },
    emitAudio: (data: string, mime: string) => audioBinding?.(data, mime),
  };

  return page;
}

describe('WebJSCallController', () => {
  it('installs the shims once and places a call', async () => {
    const page = fakePage();
    const controller = new WebJSCallController(() => page);

    const call = await controller.start('233201234567@c.us', { video: false });

    expect(call).toEqual({
      id: 'call-1',
      peerJid: '233201234567@c.us',
      isVideo: false,
      isGroup: false,
      outgoing: true,
    });
    expect(page.calls.filter((c) => c.name === 'installCallShims')).toHaveLength(1);
    const start = page.calls.find((c) => c.name === 'startCall');
    expect(start?.args).toEqual(['233201234567@c.us', false, false, 60_000, true]);
  });

  it('does not reinstall the shims on every call', async () => {
    const page = fakePage();
    const controller = new WebJSCallController(() => page);

    await controller.start('233201234567@c.us');
    await controller.active();
    await controller.end('call-1');

    expect(page.calls.filter((c) => c.name === 'installCallShims')).toHaveLength(1);
    expect(page.calls.find((c) => c.name === 'endCall')?.args).toEqual(['call-1']);
  });

  it('speaks a base64 clip and returns its duration', async () => {
    const page = fakePage();
    const controller = new WebJSCallController(() => page);

    await expect(controller.speak('AAAA')).resolves.toBe(3.5);
    expect(page.calls.find((c) => c.name === 'playCallAudio')?.args).toEqual(['AAAA']);
  });

  it('forwards tapped audio to subscribers and unsubscribes', async () => {
    const page = fakePage();
    const controller = new WebJSCallController(() => page);
    const chunks: any[] = [];

    const off = controller.onAudio((chunk) => chunks.push(chunk));
    await controller.start('233201234567@c.us');
    page.emitAudio('BASE64', 'audio/webm;codecs=opus');

    expect(chunks).toHaveLength(1);
    expect(chunks[0].data).toBe('BASE64');
    expect(chunks[0].mimeType).toBe('audio/webm;codecs=opus');

    off();
    page.emitAudio('SECOND', 'audio/webm');
    expect(chunks).toHaveLength(1);
  });

  it('fails clearly when the page is not ready', async () => {
    const controller = new WebJSCallController(() => null);
    await expect(controller.start('233201234567@c.us')).rejects.toThrow('WEBJS page is not ready');
  });

  it('reports module diagnostics', async () => {
    const page = fakePage();
    const controller = new WebJSCallController(() => page);

    const diagnostics = await controller.diagnostics();

    expect(diagnostics.webjs).toBe(true);
    expect(diagnostics.modules.WAWebVoipStartCall).toBe(true);
  });
});

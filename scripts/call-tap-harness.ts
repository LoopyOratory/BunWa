/**
 * Verifies installAudioTap() captures a remote WebRTC audio track without a
 * WhatsApp call. Run: bun run scripts/call-tap-harness.ts
 */
import puppeteer from '../node_modules/.bun/puppeteer-core@24.38.0/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { installAudioTap } from '../src/core/engines/webjs/calls.webjs';

const executablePath =
  process.env.CHROME_PATH ||
  '/opt/data/home/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';

const browser = await puppeteer.launch({
  headless: true,
  executablePath,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  const page = await browser.newPage();
  let chunks = 0;
  let bytes = 0;
  await page.exposeFunction('__bunwaCallAudio', (data: string) => {
    chunks += 1;
    bytes += Math.floor((data.length * 3) / 4);
  });

  await page.evaluate(installAudioTap);
  const trackKind = await page.evaluate(async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const osc = ctx.createOscillator();
    const dest = ctx.createMediaStreamDestination();
    osc.frequency.value = 440;
    osc.connect(dest);
    osc.start();

    const pc1 = new RTCPeerConnection({ iceServers: [] });
    const pc2 = new RTCPeerConnection({ iceServers: [] });
    const gotTrack = new Promise<MediaStreamTrack>((resolve) => {
      // Exercise the ontrack wrapper, the path WhatsApp uses.
      pc2.ontrack = (event) => resolve(event.track);
    });
    pc1.onicecandidate = (event) => {
      if (event.candidate) void pc2.addIceCandidate(event.candidate);
    };
    pc2.onicecandidate = (event) => {
      if (event.candidate) void pc1.addIceCandidate(event.candidate);
    };
    pc1.addTrack(dest.stream.getAudioTracks()[0], dest.stream);

    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);
    const track = await gotTrack;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return track.kind;
  });

  const stats = await page.evaluate(() => (globalThis as any).__bunwaTapStats);
  console.log(JSON.stringify({ trackKind, chunks, bytes, stats, pass: chunks > 0 && bytes > 0 }));
  if (!chunks) process.exitCode = 1;
} finally {
  await browser.close();
}

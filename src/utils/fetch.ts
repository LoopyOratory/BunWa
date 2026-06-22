// @ts-ignore
import * as UserAgent from 'user-agents';

export async function fetchBuffer(url: string): Promise<Buffer> {
  const userAgent = new UserAgent();
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent.toString(),
    },
    // @ts-ignore — Bun supports tls.rejectUnauthorized
    tls: { rejectUnauthorized: false },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

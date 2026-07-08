/**
 * SSRF protection for outbound fetches (webhooks, media downloads).
 * Adapted from OpenWA's ssrf-guard.ts for Bun.fetch.
 *
 * Default ON; disable with WEBHOOK_SSRF_PROTECT=false.
 * Allow internal hosts with SSRF_ALLOWED_HOSTS=host1,host2.
 */

import { isIPv4, isIPv6 } from 'net';
import { lookup } from 'dns/promises';

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export function isSsrfProtectionEnabled(): boolean {
  return process.env.WEBHOOK_SSRF_PROTECT !== 'false';
}

function getAllowedHosts(): Set<string> {
  return new Set(
    (process.env.SSRF_ALLOWED_HOSTS ?? '')
      .split(',')
      .map(h => h.trim().replace(/^\[|\]$/g, '').toLowerCase())
      .filter(Boolean),
  );
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

function inCidr4(ipInt: number, base: string, bits: number): boolean {
  const baseInt = ipv4ToInt(base);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) >>> 0 === (baseInt & mask) >>> 0;
}

const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function hextetsToV4(hi: number, lo: number): string {
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function expandIPv6(lower: string): number[] | null {
  let s = lower;
  const dotted = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const octets = dotted.slice(1, 5).map(Number);
    if (octets.some(o => o > 255)) return null;
    const [a, b, c, d] = octets;
    s = s.slice(0, dotted.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const gap = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : gap < 1) return null;
  const parts = [...head, ...Array<string>(Math.max(gap, 0)).fill('0'), ...tail];
  if (parts.length !== 8) return null;
  const nums = parts.map(h => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));
  return nums.some(n => Number.isNaN(n)) ? null : nums;
}

export function isBlockedAddress(ip: string): boolean {
  if (isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    return BLOCKED_V4.some(([base, bits]) => inCidr4(n, base, bits));
  }

  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;

    if (lower.startsWith('::ffff:')) {
      const tail = lower.slice('::ffff:'.length);
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
        return isBlockedAddress(tail);
      }
      const hextets = tail.split(':');
      if (hextets.length === 2 && hextets.every(h => /^[0-9a-f]{1,4}$/.test(h))) {
        const hi = parseInt(hextets[0], 16);
        const lo = parseInt(hextets[1], 16);
        return isBlockedAddress(hextetsToV4(hi, lo));
      }
    }

    const firstHextet = lower.split(':')[0];
    if (firstHextet.startsWith('fc') || firstHextet.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(firstHextet)) return true;

    const hextets = expandIPv6(lower);
    if (hextets) {
      if (hextets[0] === 0x2002) return isBlockedAddress(hextetsToV4(hextets[1], hextets[2]));
      if (hextets[0] === 0x64 && hextets[1] === 0xff9b) return isBlockedAddress(hextetsToV4(hextets[6], hextets[7]));
      if (hextets.slice(0, 6).every(h => h === 0) && (hextets[6] | hextets[7]) !== 0) {
        return isBlockedAddress(hextetsToV4(hextets[6], hextets[7]));
      }
    }
    return false;
  }

  return true;
}

const DEFAULT_DNS_TIMEOUT_MS = 10000;

async function lookupWithDeadline(host: string): Promise<string[]> {
  const lookupPromise = lookup(host, { all: true });
  lookupPromise.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SsrfBlockedError(`Timed out resolving host: ${host}`)), DEFAULT_DNS_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([lookupPromise, deadline]);
    return result.map(r => r.address);
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    const code = (err as NodeJS.ErrnoException)?.code;
    throw new SsrfBlockedError(`Could not resolve host: ${host}${code ? ` (${code})` : ''}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Validate an outbound URL and resolve its host. Throws SsrfBlockedError if blocked.
 * Returns resolved addresses for pinning, or null if no pinning needed.
 */
export async function resolveSafeFetchTarget(rawUrl: string): Promise<string[] | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfBlockedError(`Blocked URL scheme: ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (getAllowedHosts().has(host.toLowerCase())) {
    return null;
  }

  if (isIPv4(host) || isIPv6(host)) {
    if (isBlockedAddress(host)) {
      throw new SsrfBlockedError(`Blocked internal address: ${host}`);
    }
    return null;
  }

  const resolved = await lookupWithDeadline(host);
  if (resolved.length === 0) {
    throw new SsrfBlockedError(`Could not resolve host: ${host}`);
  }
  for (const address of resolved) {
    if (isBlockedAddress(address)) {
      throw new SsrfBlockedError(`Host ${host} resolves to a blocked internal address: ${address}`);
    }
  }
  return resolved;
}

/**
 * SSRF-safe fetch with redirect pinning.
 * Resolves the target, fetches with redirect:'manual', and follows
 * safe redirects (re-validating each hop). Max 5 hops.
 */
export async function resolveAndPinFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  if (!isSsrfProtectionEnabled()) {
    return fetch(rawUrl, init);
  }

  await resolveSafeFetchTarget(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    let url = rawUrl;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: 'manual',
      });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          throw new SsrfBlockedError('Redirect with no Location header');
        }
        const nextUrl = new URL(location, url).toString();
        await resolveSafeFetchTarget(nextUrl);
        url = nextUrl;
        continue;
      }

      return res;
    }

    throw new SsrfBlockedError('Max redirect hops exceeded');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * SSRF-safe fetch wrapper using Bun.fetch.
 * Returns a Response that the caller must consume immediately.
 * Delegates to resolveAndPinFetch.
 */
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  return resolveAndPinFetch(rawUrl, init);
}

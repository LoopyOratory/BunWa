/**
 * Link previews for outgoing text messages.
 *
 * Baileys builds a preview card only when the optional `link-preview-js`
 * package is installed. It is not a dependency here, so every preview attempt
 * failed inside Baileys and the message went out as a bare link. Separately,
 * sendLinkPreview passed `linkPreview: true`, which Baileys reads as an
 * (empty) preview object: no title, no thumbnail, no generation attempt.
 *
 * This builds the preview itself — the page's Open Graph / Twitter / <title>
 * metadata via Bun's HTMLRewriter, plus a JPEG thumbnail — and hands Baileys
 * the finished object, so nothing depends on the missing package. Every fetch
 * goes through the SSRF guard: the URL is caller-supplied and the og:image URL
 * comes from an arbitrary third-party page.
 */
import { extractImageThumb, prepareWAMessageMedia } from '@whiskeysockets/baileys';
import { resolveAndPinFetch } from '../../common/security/ssrf-guard';

/** The urlInfo shape Baileys' generateWAMessageContent consumes as `linkPreview`. */
export interface LinkPreviewInfo {
  'canonical-url': string;
  'matched-text': string;
  title: string;
  description?: string;
  originalThumbnailUrl?: string;
  jpegThumbnail?: Buffer;
  highQualityThumbnail?: any;
}

export interface PageMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export interface BuildLinkPreviewOptions {
  /** Title to use when the page cannot be fetched or has no title. */
  fallbackTitle?: string;
  /** Build a minimal card (title + link) even when the page cannot be fetched. */
  alwaysPreview?: boolean;
  /** Upload the thumbnail as a high-quality link preview (needs `upload`). */
  highQuality?: boolean;
  /** The socket's media upload function, used for high-quality thumbnails. */
  upload?: any;
  logger?: { debug?: (obj: unknown, msg?: string) => void };
  /** Overall time budget for fetching the page and image. */
  timeoutMs?: number;
}

const USER_AGENT =
  'Mozilla/5.0 (compatible; WhatsApp-LinkPreview; +https://github.com/LoopyOratory/BunWa) facebookexternalhit/1.1';
const THUMBNAIL_WIDTH_PX = 192;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
/**
 * Extra time past the budget for the steps a signal cannot cancel (building
 * the thumbnail, a high-quality upload) before the preview is abandoned.
 */
const BACKSTOP_GRACE_MS = 2_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

const cache = new Map<string, { at: number; info: LinkPreviewInfo | null }>();

/**
 * http(s) URL: a domain or IPv4 host, optional port and path; no userinfo.
 * Baileys' own matcher (extractUrlFromText) only knows https:// on a domain,
 * so an http:// link never got a preview.
 */
const URL_PATTERN =
  /\bhttps?:\/\/(?![^\s:@/]+:[^\s:@/]+@)(?:(?:[a-z0-9-]+\.)+[a-z]{2,}|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#][^\s]*)?/i;

/** The first http(s) URL in a piece of text, exactly as it appears there. */
export function firstUrlIn(text: string | undefined | null): string | undefined {
  if (!text) {
    return undefined;
  }
  const match = URL_PATTERN.exec(text)?.[0];
  // A sentence often ends right after a link ("see https://shop.example/p.")
  // — the punctuation is not part of the URL.
  return match?.replace(/[.,;:!?'")\]}>]+$/, '') || undefined;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(value: string | null | undefined, max: number): string | undefined {
  if (!value) {
    return undefined;
  }
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) {
    return undefined;
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Read at most `max` bytes of a response body, then stop — or sooner, once
 * `stopAt` matches. Preview metadata lives in <head>; a large page (GitHub
 * sends ~350 KB) need not be downloaded past it.
 */
async function readCapped(res: any, max: number, stopAt?: RegExp): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    return new Uint8Array(await res.arrayBuffer()).subarray(0, max);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const decoder = stopAt ? new TextDecoder() : undefined;
  let tail = '';
  while (total < max) {
    const { done, value } = await reader.read();
    if (done || !value) {
      break;
    }
    chunks.push(value);
    total += value.byteLength;
    if (decoder && stopAt) {
      // Keep a short overlap so a marker split across chunks still matches.
      const text = tail + decoder.decode(value, { stream: true });
      if (stopAt.test(text)) {
        break;
      }
      tail = text.slice(-16);
    }
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const chunk of chunks) {
    const room = out.byteLength - offset;
    if (room <= 0) {
      break;
    }
    out.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }
  return out;
}

// `any`: bun-types and the DOM lib disagree about Response's shape here.
async function guardedGet(url: string, accept: string, signal?: AbortSignal): Promise<any> {
  return resolveAndPinFetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: accept },
    signal,
  });
}

/** Parse Open Graph, Twitter card and <title> metadata out of an HTML document. */
export async function parsePageMetadata(html: string | Uint8Array, pageUrl: string): Promise<PageMetadata> {
  const meta: Record<string, string> = {};
  let titleText = '';
  let canonical: string | undefined;
  const rewritten: any = new HTMLRewriter()
    .on('meta', {
      element(el) {
        const key = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
        const content = el.getAttribute('content');
        if (key && content && !(key in meta)) {
          meta[key] = content;
        }
      },
    })
    .on('title', {
      text(chunk) {
        titleText += chunk.text;
      },
    })
    .on('link[rel="canonical"]', {
      element(el) {
        canonical ??= el.getAttribute('href') ?? undefined;
      },
    })
    .transform(new Response(html as any) as any);
  await rewritten.arrayBuffer();

  const resolve = (value: string | undefined) => {
    if (!value) {
      return undefined;
    }
    try {
      const absolute = new URL(decodeEntities(value.trim()), pageUrl);
      return absolute.protocol === 'http:' || absolute.protocol === 'https:' ? absolute.toString() : undefined;
    } catch {
      return undefined;
    }
  };

  return {
    url: resolve(meta['og:url'] ?? canonical) ?? pageUrl,
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? titleText, 200),
    description: clean(meta['og:description'] ?? meta['twitter:description'] ?? meta['description'], 300),
    image: resolve(
      meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['og:image:url'] ?? meta['twitter:image'] ?? meta['twitter:image:src'],
    ),
  };
}

const END_OF_HEAD = /<\/head\s*>|<body[\s>]/i;

/** Fetch a page and read its preview metadata. */
export async function fetchPageMetadata(url: string, signal?: AbortSignal): Promise<PageMetadata | null> {
  const res = await guardedGet(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', signal);
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.startsWith('image/')) {
    // A direct image link: preview it as its own thumbnail.
    await res.body?.cancel().catch(() => {});
    return { url, image: url };
  }
  if (type && !type.includes('html')) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const html = await readCapped(res, MAX_HTML_BYTES, END_OF_HEAD);
  return parsePageMetadata(html, url);
}

async function fetchImage(url: string, signal?: AbortSignal): Promise<Buffer | null> {
  const res = await guardedGet(url, 'image/*', signal);
  if (!res.ok || !(res.headers.get('content-type') ?? 'image/').startsWith('image/')) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_IMAGE_BYTES) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = await readCapped(res, MAX_IMAGE_BYTES + 1);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return null;
  }
  return Buffer.from(bytes);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function build(
  matched: string,
  options: BuildLinkPreviewOptions,
  signal: AbortSignal,
): Promise<LinkPreviewInfo | null> {
  const target = /^https?:\/\//i.test(matched) ? matched : `https://${matched}`;
  let metadata: PageMetadata | null = null;
  try {
    metadata = await fetchPageMetadata(target, signal);
  } catch (error) {
    options.logger?.debug?.({ err: String(error), url: target }, 'link preview: page fetch failed');
  }

  const title = metadata?.title ?? options.fallbackTitle;
  if (!title && !options.alwaysPreview) {
    // Nothing worth a card; WhatsApp would show an empty preview.
    return null;
  }

  const info: LinkPreviewInfo = {
    'canonical-url': metadata?.url ?? target,
    'matched-text': matched,
    title: title ?? hostnameOf(target),
    description: metadata?.description,
    originalThumbnailUrl: metadata?.image,
  };

  // Past this point the card is worth sending even if the image runs out of
  // time: a timed-out image fetch only costs the thumbnail.
  if (metadata?.image && !signal.aborted) {
    try {
      const image = await fetchImage(metadata.image, signal);
      if (image) {
        if (options.highQuality && options.upload) {
          try {
            const { imageMessage } = await prepareWAMessageMedia(
              { image },
              { upload: options.upload, mediaTypeOverride: 'thumbnail-link' } as any,
            );
            if (imageMessage) {
              info.highQualityThumbnail = imageMessage;
              if (imageMessage.jpegThumbnail) {
                info.jpegThumbnail = Buffer.from(imageMessage.jpegThumbnail);
              }
            }
          } catch (error) {
            options.logger?.debug?.({ err: String(error) }, 'link preview: high-quality upload failed');
          }
        }
        if (!info.jpegThumbnail) {
          const { buffer } = await extractImageThumb(image, THUMBNAIL_WIDTH_PX);
          info.jpegThumbnail = buffer;
        }
      }
    } catch (error) {
      options.logger?.debug?.({ err: String(error), url: metadata.image }, 'link preview: thumbnail failed');
    }
  }
  return info;
}

/**
 * Build the preview for the first URL in `text`. Returns null when the text
 * has no URL or nothing usable could be fetched (and `alwaysPreview` is off).
 * Never throws: a preview is decoration and must not fail the send.
 */
export async function buildLinkPreview(
  text: string,
  options: BuildLinkPreviewOptions = {},
): Promise<LinkPreviewInfo | null> {
  const matched = firstUrlIn(text);
  if (!matched) {
    return null;
  }
  // High-quality previews carry an uploaded media reference; don't share them.
  const cacheable = !options.highQuality && !options.fallbackTitle && !options.alwaysPreview;
  if (cacheable) {
    const hit = cache.get(matched);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.info;
    }
  }
  let info: LinkPreviewInfo | null = null;
  const budget = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    // The signal cancels the page and image downloads at the budget; the
    // backstop covers the rest.
    info = await withTimeout(build(matched, options, AbortSignal.timeout(budget)), budget + BACKSTOP_GRACE_MS);
  } catch (error) {
    options.logger?.debug?.({ err: String(error), url: matched }, 'link preview: gave up');
    info = options.alwaysPreview
      ? {
          'canonical-url': /^https?:\/\//i.test(matched) ? matched : `https://${matched}`,
          'matched-text': matched,
          title: options.fallbackTitle ?? hostnameOf(matched),
        }
      : null;
  }
  if (cacheable) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
    cache.set(matched, { at: Date.now(), info });
  }
  return info;
}

export interface CustomPreviewInput {
  url?: string;
  title?: string;
  description?: string;
  /** An http(s) URL, a data URL / base64 string, or { url } / { data }. */
  image?: string | { url?: string; data?: string };
}

/** Decode a data URL or bare base64 string; undefined when it is neither. */
function decodeImageData(value: string): Buffer | undefined {
  const data = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  const compact = data.replace(/\s+/g, '');
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return undefined;
  }
  return Buffer.from(compact, 'base64');
}

/**
 * Build a caller-described preview card (WAHA's link-custom-preview): the
 * title, description and image come from the request instead of the page.
 * The URL must appear in the text, or WhatsApp will not attach the card.
 */
export async function buildCustomLinkPreview(
  text: string,
  preview: CustomPreviewInput,
  options: BuildLinkPreviewOptions = {},
): Promise<LinkPreviewInfo | null> {
  const matched = (preview.url && text.includes(preview.url) ? preview.url : undefined) ?? firstUrlIn(text);
  if (!matched) {
    return null;
  }
  const info: LinkPreviewInfo = {
    'canonical-url': preview.url ?? matched,
    'matched-text': matched,
    title: clean(preview.title, 200) ?? hostnameOf(preview.url ?? matched),
    description: clean(preview.description, 300),
  };
  const image = preview.image;
  try {
    let bytes: Buffer | null | undefined;
    const imageUrl = typeof image === 'string' ? image : image?.url;
    const imageData = typeof image === 'object' ? image?.data : undefined;
    if (imageData) {
      bytes = decodeImageData(imageData);
    } else if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      info.originalThumbnailUrl = imageUrl;
      bytes = await fetchImage(imageUrl, AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    } else if (imageUrl) {
      bytes = decodeImageData(imageUrl);
    }
    if (bytes) {
      if (options.highQuality && options.upload) {
        const { imageMessage } = await prepareWAMessageMedia(
          { image: bytes },
          { upload: options.upload, mediaTypeOverride: 'thumbnail-link' } as any,
        );
        if (imageMessage) {
          info.highQualityThumbnail = imageMessage;
          if (imageMessage.jpegThumbnail) {
            info.jpegThumbnail = Buffer.from(imageMessage.jpegThumbnail);
          }
        }
      }
      if (!info.jpegThumbnail) {
        info.jpegThumbnail = (await extractImageThumb(bytes, THUMBNAIL_WIDTH_PX)).buffer;
      }
    }
  } catch (error) {
    options.logger?.debug?.({ err: String(error) }, 'custom link preview: image failed');
  }
  return info;
}

/** Test hook: forget cached previews. */
export function clearLinkPreviewCache(): void {
  cache.clear();
}

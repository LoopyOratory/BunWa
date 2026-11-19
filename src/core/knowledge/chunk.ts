/** Split extracted text into retrieval-sized chunks.
 *
 * BGE's tokenizer accepts 512 tokens; 900 characters is comfortably below that
 * for English and most Latin-script text, while still giving the retriever a
 * useful passage. Chunks break on paragraph and sentence boundaries first and
 * only fall back to a hard split for pathological input (minified HTML, a wall
 * of text with no punctuation).
 */

export interface TextChunk {
  index: number;
  text: string;
  charCount: number;
  /** Approximate token count (the exact count needs the model tokenizer). */
  tokenCount: number;
}

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULTS = { maxChars: 900, overlapChars: 120 };

function sentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function hardSplit(text: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    out.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start = Math.max(start + 1, end - overlapChars);
  }
  return out.filter(Boolean);
}

function units(text: string, maxChars: number, overlapChars: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const clean = paragraph.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim();
    if (!clean) continue;
    if (clean.length <= maxChars) {
      out.push(clean);
      continue;
    }
    for (const sentence of sentences(clean)) {
      if (sentence.length <= maxChars) out.push(sentence);
      else out.push(...hardSplit(sentence, maxChars, overlapChars));
    }
  }
  return out;
}

export function chunkText(text: string, options: ChunkOptions = {}): TextChunk[] {
  const maxChars = Math.max(200, options.maxChars ?? DEFAULTS.maxChars);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? DEFAULTS.overlapChars, maxChars / 2));
  const parts = units(text, maxChars, overlapChars);
  const chunks: string[] = [];
  let current = '';

  for (const part of parts) {
    if (!current) {
      current = part;
      continue;
    }
    if (current.length + 1 + part.length <= maxChars) {
      current += `\n${part}`;
      continue;
    }
    chunks.push(current.trim());
    const tail = current.slice(-overlapChars).replace(/^\S*\s/, '').trim();
    current = tail ? `${tail}\n${part}` : part;
    while (current.length > maxChars) {
      chunks.push(current.slice(0, maxChars).trim());
      current = current.slice(maxChars - overlapChars).trim();
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => ({
      index,
      text: chunk,
      charCount: chunk.length,
      tokenCount: Math.max(1, Math.ceil(chunk.length / 4)),
    }));
}

// The BERT "uncased" WordPiece tokenizer bge-small-en-v1.5 was trained with, matching Hugging
// Face's BertNormalizer + BertPreTokenizer + WordPiece (tokenizer.test.ts checks the ids against
// the reference implementation). ~80 lines instead of a tokenizer library.

export const CLS = 101
export const SEP = 102
export const UNK = 100
const MAX_CHARS_PER_WORD = 100

const isControl = (c: string) => c !== "\t" && c !== "\n" && c !== "\r" && /\p{C}/u.test(c)
const isWhitespace = (c: string) => /\s/u.test(c)
/** ASCII punctuation (which includes symbols like $ and +) or any Unicode punctuation. */
const isPunctuation = (c: string) => /[!-/:-@[-`{-~]/.test(c) || /\p{P}/u.test(c)
const isCjk = (cp: number) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x20000 && cp <= 0x2a6df) ||
  (cp >= 0x2a700 && cp <= 0x2b73f) ||
  (cp >= 0x2b740 && cp <= 0x2b81f) ||
  (cp >= 0x2b820 && cp <= 0x2ceaf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x2f800 && cp <= 0x2fa1f)

/** BertNormalizer: drop control characters, whitespace → space, space out CJK, strip accents, lowercase. */
export function normalize(text: string): string {
  let out = ""
  for (const c of text) {
    const cp = c.codePointAt(0)!
    if (cp === 0 || cp === 0xfffd || isControl(c)) continue
    out += isWhitespace(c) ? " " : isCjk(cp) ? ` ${c} ` : c
  }
  return out.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase()
}

/** BertPreTokenizer: split on whitespace, each punctuation character a word of its own. */
export function preTokenize(text: string): string[] {
  const words: string[] = []
  let word = ""
  for (const c of text) {
    if (isWhitespace(c) || isPunctuation(c)) {
      if (word) words.push(word)
      word = ""
      if (!isWhitespace(c)) words.push(c)
    } else word += c
  }
  if (word) words.push(word)
  return words
}

export function createTokenizer(vocabText: string) {
  const vocab = new Map<string, number>()
  vocabText.split("\n").forEach((token, id) => token && vocab.set(token, id))

  /** WordPiece: longest known prefix first, then "##" pieces; a word that can't be split is [UNK]. */
  function wordPiece(word: string): number[] {
    const chars = Array.from(word)
    if (chars.length > MAX_CHARS_PER_WORD) return [UNK]
    const ids: number[] = []
    for (let start = 0; start < chars.length; ) {
      let end = chars.length
      let id: number | undefined
      for (; end > start; end--) {
        id = vocab.get((start > 0 ? "##" : "") + chars.slice(start, end).join(""))
        if (id !== undefined) break
      }
      if (id === undefined) return [UNK]
      ids.push(id)
      start = end
    }
    return ids
  }

  return {
    /** [CLS] tokens [SEP], cut to `maxTokens` in all (the model reads at most 512). */
    encode(text: string, maxTokens = 512): number[] {
      const ids = preTokenize(normalize(text)).flatMap(wordPiece)
      return [CLS, ...ids.slice(0, maxTokens - 2), SEP]
    },
  }
}

export type Tokenizer = ReturnType<typeof createTokenizer>

// bge-small-en-v1.5 (BAAI, MIT licence), built in: the knowledge base's embedding model unless a
// hosted MODEL_EMBEDDING_* is configured. Runs in the worker on onnxruntime-node from the 8-bit
// ONNX export (34 MB, cosine ~0.997 to the full-precision model): the [CLS] token's state,
// L2-normalised into 384 numbers. Search queries get bge's retrieval prefix; passages don't.
import { mkdir, rename } from "node:fs/promises"
import { join, resolve } from "node:path"
import type * as Ort from "onnxruntime-node"
import type { EmbeddingProvider } from "../embeddings"
import { createTokenizer, type Tokenizer } from "./tokenizer"

import { BGE_MODEL, BGE_DIMENSIONS } from "../model"
export { BGE_MODEL, BGE_DIMENSIONS }
const DIMENSIONS = BGE_DIMENSIONS
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
/** Half the cores, at most 4: the worker also runs WhatsApp and the reply pipeline. */
const THREADS = Math.min(4, Math.max(1, Math.floor(navigator.hardwareConcurrency / 2)))

/** Pinned files (Hugging Face Xenova/bge-small-en-v1.5 at a fixed commit), checked by SHA-256. */
const SOURCE = "https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/ea104dacec62c0de699686887e3f920caeb4f3e3"
const FILES = [
  { name: "model_quantized.onnx", path: "onnx/model_quantized.onnx", sha256: "6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4" },
  { name: "vocab.txt", path: "vocab.txt", sha256: "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3" },
]

/** MODELS_DIR, or .cache/models in the working directory: the repo root in development and /app in
 *  the Docker image, for both the worker and the web app. (Not import.meta.dir: the web app's server
 *  code is bundled by Vite, where that isn't set.) */
export const modelsDir = () => process.env.BUNWA_MODELS_DIR ?? resolve(process.cwd(), ".cache/models")

const sha256 = async (path: string) => new Bun.CryptoHasher("sha256").update(await Bun.file(path).bytes()).digest("hex")

/** Makes sure the pinned files are on disk, downloading what's missing or damaged; returns their folder. */
export async function ensureBgeFiles(dir = join(modelsDir(), BGE_MODEL)): Promise<string> {
  await mkdir(dir, { recursive: true })
  for (const f of FILES) {
    const path = join(dir, f.name)
    if ((await Bun.file(path).exists()) && (await sha256(path)) === f.sha256) continue
    const res = await fetch(`${SOURCE}/${f.path}`, { signal: AbortSignal.timeout(5 * 60_000) })
    if (!res.ok) throw new Error(`downloading ${f.path}: HTTP ${res.status}`)
    const part = `${path}.part`
    await Bun.write(part, res)
    if ((await sha256(part)) !== f.sha256) throw new Error(`downloading ${f.path}: checksum mismatch`)
    await rename(part, path)
  }
  return dir
}

type Loaded = { ort: typeof Ort; session: Ort.InferenceSession; tokenizer: Tokenizer }
let loading: Promise<Loaded> | undefined

/** Loads once per process, on first use (the web process never does). A failed load is retried next time. */
function load(): Promise<Loaded> {
  loading ??= (async () => {
    const dir = await ensureBgeFiles()
    const ort = await import("onnxruntime-node")
    const session = await ort.InferenceSession.create(join(dir, "model_quantized.onnx"), { intraOpNumThreads: THREADS, graphOptimizationLevel: "all" })
    const tokenizer = createTokenizer(await Bun.file(join(dir, "vocab.txt")).text())
    return { ort, session, tokenizer }
  })().catch((err: unknown) => {
    loading = undefined
    throw err
  })
  return loading
}

/** One text per run. The 8-bit model scales its numbers over the whole input, so batched texts
 *  (and their padding) would nudge each other's vectors; one at a time is repeatable, and here
 *  it's no slower (~40 ms for a 1,000-character chunk, ~7 ms for a question). */
async function embedOne(text: string): Promise<number[]> {
  const { ort, session, tokenizer } = await load()
  const ids = tokenizer.encode(text)
  const shape = [1, ids.length]
  const out = await session.run({
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), shape),
    attention_mask: new ort.Tensor("int64", new BigInt64Array(ids.length).fill(1n), shape),
    token_type_ids: new ort.Tensor("int64", new BigInt64Array(ids.length), shape),
  })
  const cls = (out.last_hidden_state.data as Float32Array).subarray(0, DIMENSIONS) // [1, tokens, 384]: token 0
  const norm = Math.hypot(...cls) || 1
  return Array.from(cls, (x) => x / norm)
}

export function bgeEmbedder(): EmbeddingProvider {
  return {
    model: BGE_MODEL,
    dimensions: BGE_DIMENSIONS,
    async embed(texts, kind = "document") {
      const vectors: number[][] = []
      for (const text of texts) vectors.push(await embedOne(kind === "query" ? QUERY_PREFIX + text : text))
      return vectors
    },
  }
}

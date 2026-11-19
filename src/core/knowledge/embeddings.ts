import { bgeEmbedder, BGE_DIMENSIONS, BGE_MODEL } from './bge';

export type EmbeddingKind = 'document' | 'query';

export interface EmbeddingProvider {
  /** Identity of the model that produced the vectors; chunks are tagged and searched by it. */
  model: string;
  dimensions: number;
  /** `query` for a search question, `document` for stored passages. */
  embed(texts: string[], kind?: EmbeddingKind): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(
    readonly code: string,
    readonly plainMessage: string,
    readonly detail?: string,
  ) {
    super(`${code}: ${plainMessage}${detail ? ` (${detail})` : ''}`);
    this.name = 'EmbeddingError';
  }
}

let override: EmbeddingProvider | undefined;
let builtin: EmbeddingProvider | undefined;

/** Tests inject a deterministic provider. Pass undefined to reset. */
export function setEmbeddingProvider(provider: EmbeddingProvider | undefined) {
  override = provider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (override) return override;
  if (!builtin) {
    const bge = bgeEmbedder();
    builtin = {
      model: bge.model,
      dimensions: bge.dimensions,
      embed: (texts, kind) =>
        bge.embed(texts, kind).catch((error: unknown) => {
          throw new EmbeddingError(
            'provider_error',
            'The knowledge search model could not start. Check the model files and try again.',
            String(error).slice(0, 300),
          );
        }),
    };
  }
  return builtin;
}

export function builtinEmbeddingInfo(): { model: string; dimensions: number } {
  return { model: BGE_MODEL, dimensions: BGE_DIMENSIONS };
}

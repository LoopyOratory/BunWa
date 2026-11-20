/**
 * The knowledge base's embedding geometry, in one place.
 *
 * Both database schemas (pgvector `vector(N)` and sqlite-vec `float[N]`) and
 * the embedding worker must agree on N. A model swap that changes the geometry
 * must update this file and nothing else; everything that needs the number
 * imports it from here so the schemas can never drift from the model.
 */
export const BGE_MODEL = 'bge-small-en-v1.5';
export const BGE_DIMENSIONS = 384;

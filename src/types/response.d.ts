/**
 * Bun's `bun-types` decides whether `Response` comes from the DOM lib or from
 * `undici-types`. In CI the fallback can resolve to an empty interface, which
 * makes `response.ok`, `response.text()` and friends disappear from the type
 * checker even though they exist at runtime. Declare the small surface this
 * server uses so the build does not depend on which lib set the runner loads.
 */
export {};

declare global {
  interface Response {
    readonly ok: boolean;
    readonly status: number;
    readonly body: any;
    readonly headers: { get(name: string): string | null };
    text(): Promise<string>;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
}

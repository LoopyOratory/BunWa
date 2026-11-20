/**
 * The REAL ssrf-guard implementation, as a module instance bun never swaps.
 *
 * Bun's mock.module replaces the ssrf-guard module record in place: every
 * importer — direct, same-file, or through a plain re-export helper — ends up
 * bound to the mocked record, so a "call through to the real implementation"
 * captured that way recurses into itself forever. A query string in the
 * specifier makes bun load a distinct, unswapped instance of the same source.
 * Test files use this to restore real behaviour once their own tests are done.
 */

// @ts-expect-error — the query specifier is bun-only; tsc cannot resolve it.
// It is exactly what keeps this instance out of mock.module's reach.
const real = (await import('../../common/security/ssrf-guard.ts?real-implementation')) as typeof import('../../common/security/ssrf-guard');

export const SsrfBlockedError: typeof import('../../common/security/ssrf-guard').SsrfBlockedError = real.SsrfBlockedError;
export const isSsrfProtectionEnabled: typeof import('../../common/security/ssrf-guard').isSsrfProtectionEnabled = real.isSsrfProtectionEnabled;
export const isBlockedAddress: typeof import('../../common/security/ssrf-guard').isBlockedAddress = real.isBlockedAddress;
export const resolveSafeFetchTarget: typeof import('../../common/security/ssrf-guard').resolveSafeFetchTarget = real.resolveSafeFetchTarget;
export const resolveAndPinFetch: typeof import('../../common/security/ssrf-guard').resolveAndPinFetch = real.resolveAndPinFetch;
export const safeFetch: typeof import('../../common/security/ssrf-guard').safeFetch = real.safeFetch;

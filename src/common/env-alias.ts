/**
 * BUNWA_* env variables with WAHA_* legacy fallback.
 *
 * Every WAHA_* variable was renamed to BUNWA_* when the platform became
 * BunWa. Existing deployments that still export the old spelling must keep
 * working, so this proxy (installed on import, before anything reads
 * process.env) makes both spellings equivalent process-wide:
 *
 *   read BUNWA_X  ->  BUNWA_X if set, otherwise the legacy WAHA_X
 *
 * New code reads BUNWA_* only; the fallback is this module's job, not each
 * call site's. main.ts imports it first, bunfig.toml preloads it for tests.
 */

const LEGACY_PREFIX = 'WAHA_';
const CANONICAL_PREFIX = 'BUNWA_';

let aliasedEnv: NodeJS.ProcessEnv | null = null;

/** Idempotent: installs the alias proxy over process.env. */
export function installBunwaEnvAlias(): void {
  if (aliasedEnv) return;
  const rawEnv = process.env;
  aliasedEnv = new Proxy(rawEnv, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property.startsWith(CANONICAL_PREFIX)) {
        const canonical = Reflect.get(target, property, receiver);
        if (canonical !== undefined) {
          return canonical;
        }
        return Reflect.get(target, LEGACY_PREFIX + property.slice(CANONICAL_PREFIX.length), receiver);
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (typeof property === 'string' && property.startsWith(CANONICAL_PREFIX)) {
        if (Reflect.has(target, property)) return true;
        return Reflect.has(target, LEGACY_PREFIX + property.slice(CANONICAL_PREFIX.length));
      }
      return Reflect.has(target, property);
    },
    // Bun's env object validates descriptors strictly; forwarding [[Set]] with
    // a different receiver degrades to defineProperty and trips that check.
    // Write through to the raw object explicitly instead.
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
    deleteProperty(target, property) {
      delete target[property as string];
      return true;
    },
    defineProperty(target, property, descriptor) {
      Object.defineProperty(target, property, descriptor);
      return true;
    },
  });
  // Writes still go through to the real object (default set behavior), so
  // `process.env.X = ...` in tests keeps hitting the underlying map.
  Object.defineProperty(process, 'env', {
    value: aliasedEnv,
    writable: true,
    configurable: true,
  });
}

installBunwaEnvAlias();

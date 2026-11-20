import { TtlCache } from '../../../utils/ttl-cache';

export class PresenceProxy {
  private cache: TtlCache;

  public proxy: Record<string, any>;

  constructor() {
    this.cache = new TtlCache({
      stdTtl: 60, // 1 minute
      checkperiod: 60, // 1 minute
      useClones: false,
    });

    this.proxy = new Proxy(
      {},
      {
        get: (_, prop: string) => {
          return this.cache.get(prop);
        },

        set: (_, prop: string, value) => {
          this.cache.set(prop, value);
          return true;
        },

        deleteProperty: (_, prop: string) => {
          return this.cache.has(prop) ? (this.cache.del(prop), true) : false;
        },

        has: (_, prop: string) => {
          return this.cache.has(prop);
        },

        ownKeys: () => {
          return this.cache.keys();
        },

        getOwnPropertyDescriptor: (_, prop: string) => {
          if (this.cache.has(prop)) {
            return {
              enumerable: true,
              configurable: true,
            };
          }
          return undefined;
        },
      },
    );
  }
}

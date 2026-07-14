export class DefaultMap<K, T> extends Map<K, T> {
  private readonly factory: (key: K) => T;

  constructor(factory: (key: K) => T) {
    super();
    this.factory = factory;
  }

  get(key: K): T {
    if (!this.has(key)) {
      this.set(key, this.factory(key));
    }
    // Guaranteed present: we just checked has(key) and set() a value if missing.
    return super.get(key)!;
  }
}
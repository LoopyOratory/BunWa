/**
 * Tool registry — holds all available tool descriptors and provides lookup.
 * Pure data structure, no framework coupling.
 */
import type { ToolDescriptor } from './tool-descriptor';

export class ToolRegistryService {
  private readonly byName = new Map<string, ToolDescriptor>();

  constructor(tools: ToolDescriptor[]) {
    for (const t of tools) {
      if (this.byName.has(t.name)) {
        throw new Error(`Duplicate tool name: ${t.name}`);
      }
      this.byName.set(t.name, t);
    }
  }

  list(opts: { readOnly?: boolean } = {}): ToolDescriptor[] {
    const all = [...this.byName.values()];
    return opts.readOnly ? all.filter(t => t.tier === 'read') : all;
  }

  get(name: string): ToolDescriptor | undefined {
    return this.byName.get(name);
  }
}

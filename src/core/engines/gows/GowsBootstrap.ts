import { EngineBootstrap } from '../../abc/EngineBootstrap';

export class GowsBootstrap implements EngineBootstrap {
  async bootstrap(): Promise<void> {
    // GOWS engine not supported in Bun version
  }

  async shutdown(): Promise<void> {
    // GOWS engine not supported in Bun version
  }
}

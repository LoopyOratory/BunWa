export class WAHAEnvironment {
  version: string;
  engine: string;
  tier: string;
  browser: string | null;
  platform: string;
  worker: {
    id: string | null;
  };
}

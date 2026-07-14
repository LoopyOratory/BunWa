export class SinglePeriodicJobRunner {
  private interval: any = null;
  private running: boolean = false;
  private job: (() => Promise<void>) | null = null;

  constructor(
    private name: string,
    private intervalMs: number,
    private logger?: { debug?: (msg: string) => void },
  ) {}

  async start(fn: () => Promise<void>): Promise<void> {
    this.job = fn;
    if (this.interval) {
      return;
    }
    this.interval = setInterval(async () => {
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        await this.job?.();
      } finally {
        this.running = false;
      }
    }, this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export class SinglePeriodicJobRunner {
  private interval: any = null;
  private running: boolean = false;

  constructor(private job: () => Promise<void>, private intervalMs: number) {}

  async start(): Promise<void> {
    if (this.interval) {
      return;
    }
    this.interval = setInterval(async () => {
      if (this.running) {
        return;
      }
      this.running = true;
      try {
        await this.job();
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

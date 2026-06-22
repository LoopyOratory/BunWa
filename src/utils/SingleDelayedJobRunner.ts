export class SingleDelayedJobRunner {
  private timeout: any = null;

  constructor(private job: () => Promise<void>, private delayMs: number) {}

  async run(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(async () => {
      await this.job();
      this.timeout = null;
    }, this.delayMs);
  }

  schedule(fn: () => Promise<void>): void {
    this.job = fn;
    this.run();
  }

  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

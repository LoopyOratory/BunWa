export class SingleDelayedJobRunner {
  private timeout: any = null;
  private job: (() => Promise<void>) | null = null;

  constructor(
    private name: string,
    private delayMs: number,
    private logger?: { debug?: (msg: string) => void },
  ) {}

  private async run(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(async () => {
      await this.job?.();
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

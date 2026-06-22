export class StatusTracker {
  private counts: Map<string, number> = new Map();
  private threshold: number;

  constructor(threshold: number = 60) {
    this.threshold = threshold;
  }

  track(status: string): boolean {
    const count = (this.counts.get(status) || 0) + 1;
    this.counts.set(status, count);
    return count >= this.threshold;
  }

  reset(status?: string): void {
    if (status) {
      this.counts.delete(status);
    } else {
      this.counts.clear();
    }
  }

  getCount(status: string): number {
    return this.counts.get(status) || 0;
  }

  isStuckInStarting(): boolean {
    return this.getCount('STARTING') >= this.threshold;
  }
}

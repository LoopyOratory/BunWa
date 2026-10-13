/**
 * Tracks NOWEB link-time history sync.
 *
 * WhatsApp pushes history in batches (`messaging-history.set`) right after a
 * device is linked. Nothing said whether it arrived or finished, so this
 * counts what the store actually wrote, marks completion on progress 100 or
 * after a quiet window (WhatsApp does not always send a final marker), and
 * persists the state so a restart still reports it.
 */
export type HistorySyncState = 'idle' | 'syncing' | 'complete' | 'unsupported';

export interface HistorySyncStatus {
  state: HistorySyncState;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  batches: number;
  messages: number;
  chats: number;
  contacts: number;
  progress: number | null;
  syncType: string | null;
  isLatest: boolean;
}

export interface HistoryBatch {
  messages: number;
  chats: number;
  contacts: number;
  progress?: number | null;
  syncType?: unknown;
  isLatest?: boolean;
}

export function emptyHistorySyncStatus(state: HistorySyncState = 'idle'): HistorySyncStatus {
  return {
    state,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    batches: 0,
    messages: 0,
    chats: 0,
    contacts: 0,
    progress: null,
    syncType: null,
    isLatest: false,
  };
}

export class HistorySyncTracker {
  private current = emptyHistorySyncStatus();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmit = 0;
  private readonly idleMs: number;
  private readonly emitEveryMs: number;

  constructor(
    private readonly opts: {
      file: string | null;
      onChange: (status: HistorySyncStatus) => void;
      idleMs?: number;
      emitEveryMs?: number;
    },
  ) {
    this.idleMs = opts.idleMs ?? 120_000;
    this.emitEveryMs = opts.emitEveryMs ?? 5_000;
  }

  async load(): Promise<void> {
    if (!this.opts.file) return;
    const file = Bun.file(this.opts.file);
    if (!(await file.exists())) return;
    try {
      const saved = (await file.json()) as HistorySyncStatus;
      // A sync interrupted by a restart cannot resume; report what landed.
      this.current = { ...saved, state: saved.state === 'syncing' ? 'complete' : saved.state };
    } catch {
      // A corrupt state file just means "unknown"; start from idle.
    }
  }

  status(): HistorySyncStatus {
    return { ...this.current };
  }

  record(batch: HistoryBatch): void {
    const now = new Date().toISOString();
    const first = this.current.state !== 'syncing';
    if (first) {
      this.current = { ...emptyHistorySyncStatus('syncing'), startedAt: now };
    }
    const s = this.current;
    s.batches += 1;
    s.messages += batch.messages;
    s.chats += batch.chats;
    s.contacts += batch.contacts;
    s.updatedAt = now;
    if (typeof batch.progress === 'number') s.progress = batch.progress;
    if (batch.syncType !== undefined && batch.syncType !== null) s.syncType = String(batch.syncType);
    if (batch.isLatest) s.isLatest = true;

    if (typeof batch.progress === 'number' && batch.progress >= 100) {
      this.complete();
      return;
    }
    this.armIdle();
    if (first || Date.now() - this.lastEmit >= this.emitEveryMs) this.emit();
    else this.persist();
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.complete(), this.idleMs);
    (this.idleTimer as any).unref?.();
  }

  private complete(): void {
    this.dispose();
    if (this.current.state !== 'syncing') return;
    this.current.state = 'complete';
    this.current.completedAt = new Date().toISOString();
    this.emit();
  }

  private emit(): void {
    this.lastEmit = Date.now();
    this.persist();
    try {
      this.opts.onChange(this.status());
    } catch {
      // A listener failure must never break the store or the socket.
    }
  }

  private persist(): void {
    if (!this.opts.file) return;
    Bun.write(this.opts.file, JSON.stringify(this.current)).catch(() => {});
  }
}

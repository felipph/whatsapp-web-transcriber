import type { JobPriority } from '../shared/messages';

export interface QueueJob {
  messageId: string;
  blob: Blob;
  priority: JobPriority;
  durationSec?: number;
  retries: number;
}

type StatusCb = (
  messageId: string,
  status: 'queued' | 'transcribing' | 'done' | 'error' | 'cancelled',
  payload?: { text?: string; error?: string },
) => void;

type ProcessFn = (
  job: QueueJob,
  signal: { cancelled: boolean },
) => Promise<string>;

export class TranscriptionQueue {
  private queue: QueueJob[] = [];
  private active: QueueJob | null = null;
  private cancelFlags = new Map<string, { cancelled: boolean }>();
  private running = false;
  private readonly process: ProcessFn;
  private readonly onStatus: StatusCb;
  private readonly hasCached: (messageId: string) => Promise<string | undefined>;

  constructor(opts: {
    process: ProcessFn;
    onStatus: StatusCb;
    hasCached: (messageId: string) => Promise<string | undefined>;
  }) {
    this.process = opts.process;
    this.onStatus = opts.onStatus;
    this.hasCached = opts.hasCached;
  }

  async enqueue(job: Omit<QueueJob, 'retries'> & { retries?: number }): Promise<void> {
    const cached = await this.hasCached(job.messageId);
    if (cached && job.priority === 'auto') {
      this.onStatus(job.messageId, 'done', { text: cached });
      return;
    }

    // Dedupe: if already queued or active, bump priority if manual
    if (this.active?.messageId === job.messageId) {
      if (job.priority === 'manual') {
        // already running — nothing to bump
      }
      return;
    }

    const existingIdx = this.queue.findIndex((j) => j.messageId === job.messageId);
    if (existingIdx >= 0) {
      const existing = this.queue[existingIdx]!;
      if (job.priority === 'manual' && existing.priority === 'auto') {
        existing.priority = 'manual';
        this.queue.splice(existingIdx, 1);
        this.queue.unshift(existing);
      }
      return;
    }

    const full: QueueJob = {
      ...job,
      retries: job.retries ?? 0,
    };

    if (job.priority === 'manual') {
      this.queue.unshift(full);
    } else {
      this.queue.push(full);
    }

    this.cancelFlags.set(job.messageId, { cancelled: false });
    this.onStatus(job.messageId, 'queued');
    void this.pump();
  }

  cancel(messageId: string): void {
    const flag = this.cancelFlags.get(messageId);
    if (flag) flag.cancelled = true;

    const idx = this.queue.findIndex((j) => j.messageId === messageId);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.onStatus(messageId, 'cancelled');
    }
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      while (this.queue.length > 0) {
        // Prefer manual jobs at front (already ordered), but re-sort to be safe
        this.queue.sort((a, b) => {
          if (a.priority === b.priority) return 0;
          return a.priority === 'manual' ? -1 : 1;
        });

        const job = this.queue.shift()!;
        this.active = job;
        const signal = this.cancelFlags.get(job.messageId) ?? { cancelled: false };

        if (signal.cancelled) {
          this.onStatus(job.messageId, 'cancelled');
          this.active = null;
          continue;
        }

        this.onStatus(job.messageId, 'transcribing');

        try {
          const text = await this.process(job, signal);
          if (signal.cancelled) {
            this.onStatus(job.messageId, 'cancelled');
          } else {
            this.onStatus(job.messageId, 'done', { text });
          }
        } catch (err) {
          if (signal.cancelled) {
            this.onStatus(job.messageId, 'cancelled');
          } else if (job.retries < 1) {
            job.retries += 1;
            this.queue.unshift(job);
          } else {
            const message =
              err instanceof Error ? err.message : 'Falha ao transcrever o áudio.';
            this.onStatus(job.messageId, 'error', { error: message });
          }
        } finally {
          this.active = null;
        }
      }
    } finally {
      this.running = false;
    }
  }
}

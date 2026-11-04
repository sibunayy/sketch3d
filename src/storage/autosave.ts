import { signal } from '@preact/signals';
import type { Doc } from '../core/doc/types';
import type { SaveResult } from './db';

export type SaveStatus = 'saved' | 'saving' | 'not-saved';
type Problem = 'blocked' | 'quota' | 'unknown';

/**
 * Saves the toy a moment after every change, and straight away when asked (`flush`).
 * It never throws: if saving does not work, `status` says "not-saved" and `onProblem` is told once.
 */
export class Autosave {
  readonly status = signal<SaveStatus>('saved');

  private latest: Doc | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private reported = false;
  private readonly problemListeners: ((reason: Problem) => void)[] = [];

  constructor(
    private readonly save: (doc: Doc) => Promise<SaveResult>,
    private readonly delayMs = 500,
  ) {}

  /** The toy changed. */
  notify(doc: Doc): void {
    this.latest = doc;
    this.dirty = true;
    this.status.value = 'saving';
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.write();
    }, this.delayMs);
  }

  /** Save now. Resolves when the write is done (or has failed). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.write();
  }

  /** Called the first time saving fails (and again after it has worked and then failed again). */
  onProblem(cb: (reason: Problem) => void): void {
    this.problemListeners.push(cb);
  }

  private async write(): Promise<void> {
    if (this.running) {
      await this.running;
      return;
    }
    const doc = this.latest;
    if (!doc || !this.dirty) return;
    this.dirty = false;
    this.running = (async () => {
      let result: SaveResult;
      try {
        result = await this.save(doc);
      } catch {
        result = { ok: false, reason: 'unknown' };
      }
      if (result.ok) {
        this.reported = false;
        this.status.value = this.dirty ? 'saving' : 'saved';
      } else {
        this.dirty = true; // try again next time
        this.status.value = 'not-saved';
        if (!this.reported) {
          this.reported = true;
          for (const cb of this.problemListeners.slice()) cb(result.reason);
        }
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
}

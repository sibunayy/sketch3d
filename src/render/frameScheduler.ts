/**
 * Draws on demand. `request()` asks for a frame; many requests before the next frame become one.
 * Nothing runs until something asks, so an idle page uses no power (no constant loop).
 */
export class FrameScheduler {
  private pending = false;
  private cancelled = false;

  constructor(
    private readonly raf: (callback: () => void) => unknown,
    private readonly draw: () => void,
  ) {}

  request(): void {
    if (this.pending || this.cancelled) return;
    this.pending = true;
    this.raf(() => {
      this.pending = false;
      if (!this.cancelled) this.draw();
    });
  }

  /** No more frames will be drawn. */
  cancel(): void {
    this.cancelled = true;
  }
}

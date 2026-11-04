export type GestureMode = 'stroke' | 'pinch' | 'pan' | 'none';

/** What the recogniser needs to know about a pointer event. A real PointerEvent can be turned into this. */
export interface PointerLike {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
  pointerId: number;
  pointerType: 'mouse' | 'touch' | 'pen';
  x: number;
  y: number;
  /** Mouse button: 0 left, 1 middle, 2 right. */
  button: number;
  time: number;
}

/** A touch that moves less than this many pixels is a tap, not a drawing. */
export const TAP_PX = 6;

/** True if the stroke never strays further than TAP_PX from where it began. */
export function isTap(points: readonly (readonly [number, number])[]): boolean {
  if (points.length === 0) return true;
  const [x0, y0] = points[0];
  return points.every(([x, y]) => Math.hypot(x - x0, y - y0) < TAP_PX);
}

/**
 * Decides what a set of fingers (or a mouse, or a pen) is doing: drawing, pinching, or sliding the view.
 *
 * - A second finger landing mid-stroke cancels the stroke (`strokeCancelled`) and starts a pinch.
 * - After a pinch, a finger left behind does nothing until everything is lifted.
 * - While a pen is down, touches are palms: they are ignored.
 */
export class GestureRecogniser {
  /** True when the last event cancelled a stroke that was in progress. The caller must drop it without committing. */
  strokeCancelled = false;
  /** The pointer that is drawing the current stroke, or null. */
  activePointerForStroke: number | null = null;

  private mode: GestureMode = 'none';
  private readonly down = new Map<number, PointerLike['pointerType']>();
  private ignored = new Set<number>();

  feed(e: PointerLike): GestureMode {
    this.strokeCancelled = false;

    if (e.type === 'pointerdown') return this.onDown(e);

    if (this.ignored.has(e.pointerId)) {
      if (e.type === 'pointerup' || e.type === 'pointercancel') this.ignored.delete(e.pointerId);
      return this.mode;
    }
    if (!this.down.has(e.pointerId)) return this.mode === 'none' ? 'none' : this.mode;

    if (e.type === 'pointermove') return this.mode;

    // pointerup or pointercancel
    const wasStroking = this.mode === 'stroke' && this.activePointerForStroke === e.pointerId;
    this.down.delete(e.pointerId);
    if (e.type === 'pointercancel' && wasStroking) this.strokeCancelled = true;
    if (this.activePointerForStroke === e.pointerId) this.activePointerForStroke = null;
    if (this.down.size === 0) {
      this.mode = 'none';
      this.ignored.clear();
    } else if (this.mode === 'pinch' && this.down.size < 2) {
      this.mode = 'none'; // one finger is left over after a pinch: do nothing with it
    }
    return this.mode;
  }

  private onDown(e: PointerLike): GestureMode {
    const penDown = [...this.down.values()].includes('pen');
    if (e.pointerType === 'touch' && penDown) {
      this.ignored.add(e.pointerId); // a palm resting while the pen draws
      return this.mode;
    }
    if (e.pointerType === 'pen') {
      // the pen wins: drop any touches that were already down
      for (const [id, kind] of [...this.down]) {
        if (kind === 'touch') {
          this.down.delete(id);
          this.ignored.add(id);
        }
      }
      this.down.set(e.pointerId, 'pen');
      this.mode = 'stroke';
      this.activePointerForStroke = e.pointerId;
      return this.mode;
    }

    if (e.pointerType === 'mouse') {
      this.down.set(e.pointerId, 'mouse');
      this.mode = e.button === 0 ? 'stroke' : 'pan';
      this.activePointerForStroke = this.mode === 'stroke' ? e.pointerId : null;
      return this.mode;
    }

    // touch
    this.down.set(e.pointerId, 'touch');
    const touches = [...this.down.values()].filter((k) => k === 'touch').length;
    if (touches >= 2) {
      if (this.mode === 'stroke') this.strokeCancelled = true;
      this.activePointerForStroke = null;
      this.mode = 'pinch';
    } else if (this.mode === 'none') {
      this.mode = 'stroke';
      this.activePointerForStroke = e.pointerId;
    }
    return this.mode;
  }
}

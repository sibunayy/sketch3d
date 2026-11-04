import type { Vec2 } from '../core/geom/vec';

export const MIN_SCALE = 1;
export const MAX_SCALE = 40;

/**
 * Maps between millimetres in the drawing and pixels on the screen. y goes up in the drawing and down on the screen.
 * The same maths serves the Front view (x, y) and the Side view (z, y).
 */
export class ViewTransform {
  /** Pixels per millimetre. */
  scale = 4;
  /** Where (0, 0) is on the screen. */
  ox = 0;
  oy = 0;

  worldToScreen(p: Vec2): Vec2 {
    return [this.ox + p[0] * this.scale, this.oy - p[1] * this.scale];
  }

  screenToWorld(p: Vec2): Vec2 {
    return [(p[0] - this.ox) / this.scale, (this.oy - p[1]) / this.scale];
  }

  /** Zoom by `factor` (above 1 is closer) so the point under `screen` stays where it is. */
  zoomAt(screen: Vec2, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const k = next / this.scale;
    this.ox = screen[0] - (screen[0] - this.ox) * k;
    this.oy = screen[1] - (screen[1] - this.oy) * k;
    this.scale = next;
  }

  pan(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.ox += dx;
    this.oy += dy;
  }

  /** Centre a box of the drawing on a screen of the given size, with a little room around it. */
  fit(box: { x0: number; y0: number; x1: number; y1: number }, width: number, height: number, margin = 24): void {
    const bw = Math.max(box.x1 - box.x0, 1e-6);
    const bh = Math.max(box.y1 - box.y0, 1e-6);
    this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((width - 2 * margin) / bw, (height - 2 * margin) / bh)));
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    this.ox = width / 2 - cx * this.scale;
    this.oy = height / 2 + cy * this.scale;
  }
}

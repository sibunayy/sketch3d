import { bbox } from './bounds';
import type { Vec2 } from './vec';

/**
 * Signed distance to a closed 2D outline (negative inside), in millimetres.
 *
 * `exact()` checks every segment. `sample()` reads a pre-computed grid and interpolates, which is
 * much faster. A bilinear grid is wrong near kinks (the middle of a circle, sharp corners), so
 * those cells are marked at build time and `sample()` uses the exact answer there.
 *
 * Coordinates are relative to the outline's own bottom-left corner, so a grid stays valid when the
 * part is moved. The caller subtracts the corner (see `buildPartField`).
 */
export class OutlineField {
  readonly width: number;
  readonly height: number;
  /** Radius of the biggest circle that fits inside the outline. */
  readonly inscribedRadius: number;
  /** Share of grid cells that fall back to the exact answer. */
  readonly exactCellFraction: number;

  private readonly n: number;
  private readonly X: Float64Array;
  private readonly Y: Float64Array;
  private readonly ex: Float64Array;
  private readonly ey: Float64Array;
  private readonly il: Float64Array;
  private readonly margin: number;
  private readonly cell: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly d: Float32Array;
  private readonly useExact: Uint8Array;

  constructor(outline: readonly Vec2[], cell: number, margin: number) {
    const n = outline.length;
    const b = bbox(outline);
    this.n = n;
    this.width = b.w;
    this.height = b.h;
    this.margin = margin;
    this.cell = cell;
    const X = (this.X = new Float64Array(n));
    const Y = (this.Y = new Float64Array(n));
    const ex = (this.ex = new Float64Array(n));
    const ey = (this.ey = new Float64Array(n));
    const il = (this.il = new Float64Array(n));
    for (let i = 0; i < n; i++) {
      X[i] = outline[i][0] - b.x0;
      Y[i] = outline[i][1] - b.y0;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      ex[i] = X[j] - X[i];
      ey[i] = Y[j] - Y[i];
      const l2 = ex[i] * ex[i] + ey[i] * ey[i];
      il[i] = l2 > 0 ? 1 / l2 : 0;
    }

    // turning angle at each vertex (between segment i - 1 and segment i), and running totals
    const turn = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n;
      const cross = ex[p] * ey[i] - ey[p] * ex[i];
      const dot = ex[p] * ex[i] + ey[p] * ey[i];
      turn[i] = Math.abs(Math.atan2(cross, dot));
    }
    const prefix = new Float64Array(n); // prefix[k] = turning over vertices 1..k
    for (let k = 1; k < n; k++) prefix[k] = prefix[k - 1] + turn[k];
    let totalTurn = prefix[n - 1] + turn[0];
    if (!(totalTurn > 0)) totalTurn = 1;
    /** Turning along the shorter way round between two segments. */
    const turnBetween = (a: number, c: number): number => {
      const lo = a < c ? a : c;
      const hi = a < c ? c : a;
      const direct = prefix[hi] - prefix[lo];
      return Math.min(direct, totalTurn - direct);
    };
    const SHARP = 0.26; // about 15 degrees

    const nx = (this.nx = Math.ceil((b.w + 2 * margin) / cell) + 1);
    const ny = (this.ny = Math.ceil((b.h + 2 * margin) / cell) + 1);
    const d = (this.d = new Float32Array(nx * ny));
    const seg = new Int32Array(nx * ny);
    const nearSharp = new Uint8Array(nx * ny);

    let bestIn = 0;
    let bestInX = 0;
    let bestInY = 0;
    for (let j = 0; j < ny; j++) {
      const py = -margin + j * cell;
      for (let i = 0; i < nx; i++) {
        const px = -margin + i * cell;
        let best = Infinity;
        let bestE = 0;
        let bestT = 0;
        let inside = false;
        for (let e = 0; e < n; e++) {
          let t = ((px - X[e]) * ex[e] + (py - Y[e]) * ey[e]) * il[e];
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = px - X[e] - t * ex[e];
          const dy = py - Y[e] - t * ey[e];
          const q = dx * dx + dy * dy;
          if (q < best) {
            best = q;
            bestE = e;
            bestT = t;
          }
          const k = e + 1 === n ? 0 : e + 1;
          if (Y[e] <= py !== Y[k] <= py && px < X[e] + ((py - Y[e]) * ex[e]) / ey[e]) inside = !inside;
        }
        const dist = Math.sqrt(best);
        const idx = j * nx + i;
        d[idx] = inside ? -dist : dist;
        seg[idx] = bestE;
        if (inside && dist > bestIn) {
          bestIn = dist;
          bestInX = px;
          bestInY = py;
        }
        // is the nearest point a sharp corner? Then the field is cone-shaped nearby.
        if (dist < 2.5 && (bestT === 0 || bestT === 1)) {
          const v = bestT === 0 ? bestE : (bestE + 1) % n;
          if (turn[v] >= SHARP) nearSharp[idx] = 1;
        }
      }
    }

    // mark the cells where interpolation cannot be trusted
    const cx = nx - 1;
    const cy = ny - 1;
    const useExact = (this.useExact = new Uint8Array(cx * cy));
    let marked = 0;
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const k0 = j * nx + i;
        const s0 = seg[k0], s1 = seg[k0 + 1], s2 = seg[k0 + nx], s3 = seg[k0 + nx + 1];
        let bad =
          nearSharp[k0] || nearSharp[k0 + 1] || nearSharp[k0 + nx] || nearSharp[k0 + nx + 1] ? 1 : 0;
        if (!bad && (s0 !== s1 || s0 !== s2 || s0 !== s3)) {
          bad =
            turnBetween(s0, s1) > SHARP || turnBetween(s0, s2) > SHARP || turnBetween(s0, s3) > SHARP ||
            turnBetween(s1, s2) > SHARP || turnBetween(s1, s3) > SHARP || turnBetween(s2, s3) > SHARP
              ? 1
              : 0;
        }
        useExact[j * cx + i] = bad;
        marked += bad;
      }
    }
    this.exactCellFraction = cx * cy > 0 ? marked / (cx * cy) : 0;

    // The grid maximum is only accurate to about a cell. Climb to the true widest point.
    let step = cell / 2;
    let x = bestInX;
    let y = bestInY;
    let r = -this.exact(x, y);
    for (let iter = 0; iter < 200 && step > 1e-4; iter++) {
      let moved = false;
      for (let a = 0; a < 8; a++) {
        const nxp = x + Math.cos((a * Math.PI) / 4) * step;
        const nyp = y + Math.sin((a * Math.PI) / 4) * step;
        const v = -this.exact(nxp, nyp);
        if (v > r) {
          r = v;
          x = nxp;
          y = nyp;
          moved = true;
        }
      }
      if (!moved) step /= 2;
    }
    this.inscribedRadius = Math.max(r, bestIn, 0);
  }

  /** Exact signed distance, checking every segment. Slow; use for tests and for kinks. */
  exact(px: number, py: number): number {
    const { n, X, Y, ex, ey, il } = this;
    let best = Infinity;
    let inside = false;
    for (let e = 0; e < n; e++) {
      let t = ((px - X[e]) * ex[e] + (py - Y[e]) * ey[e]) * il[e];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - X[e] - t * ex[e];
      const dy = py - Y[e] - t * ey[e];
      const q = dx * dx + dy * dy;
      if (q < best) best = q;
      const k = e + 1 === n ? 0 : e + 1;
      if (Y[e] <= py !== Y[k] <= py && px < X[e] + ((py - Y[e]) * ex[e]) / ey[e]) inside = !inside;
    }
    const dist = Math.sqrt(best);
    return inside ? -dist : dist;
  }

  /** Fast signed distance from the grid. Far outside the grid it returns a safe lower bound. */
  sample(px: number, py: number): number {
    const { nx, ny, cell, margin } = this;
    const u = (px + margin) / cell;
    const v = (py + margin) / cell;
    if (u < 0 || v < 0 || u > nx - 1 || v > ny - 1) {
      const gx0 = -margin;
      const gy0 = -margin;
      const gx1 = gx0 + (nx - 1) * cell;
      const gy1 = gy0 + (ny - 1) * cell;
      const ox = Math.max(gx0 - px, 0, px - gx1);
      const oy = Math.max(gy0 - py, 0, py - gy1);
      return margin + Math.hypot(ox, oy);
    }
    let i = u | 0;
    let j = v | 0;
    if (i > nx - 2) i = nx - 2;
    if (j > ny - 2) j = ny - 2;
    if (this.useExact[j * (nx - 1) + i] === 1) return this.exact(px, py);
    const fu = u - i;
    const fv = v - j;
    const k = j * nx + i;
    const d = this.d;
    return (d[k] * (1 - fu) + d[k + 1] * fu) * (1 - fv) + (d[k + nx] * (1 - fu) + d[k + nx + 1] * fu) * fv;
  }
}

/** A string that is the same for two outlines with the same shape, wherever they sit. */
export function outlineSignature(outline: readonly Vec2[], cell: number, margin: number): string {
  const b = bbox(outline);
  let s = cell.toFixed(3) + '|' + margin.toFixed(2) + '|';
  for (const q of outline) s += (q[0] - b.x0).toFixed(3) + ',' + (q[1] - b.y0).toFixed(3) + ' ';
  return s;
}

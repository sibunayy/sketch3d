import type { Box3 } from './bounds';

/**
 * A coarse 3D grid that lists, for each cell, which items might reach into it.
 * Items stay in the order they were given, so callers can keep "apply in order" semantics.
 * Lookup does not allocate: read `items[starts[cell]] ... items[starts[cell + 1] - 1]`.
 */
export class SpatialIndex {
  readonly starts: Int32Array;
  readonly items: Int32Array;
  readonly bounds: Box3;
  private readonly inv: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;

  constructor(boxes: readonly Box3[], cellMm = 8) {
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const b of boxes) {
      for (let a = 0; a < 3; a++) {
        if (b.min[a] < lo[a]) lo[a] = b.min[a];
        if (b.max[a] > hi[a]) hi[a] = b.max[a];
      }
    }
    if (boxes.length === 0) {
      lo.fill(0);
      hi.fill(0);
    }
    this.bounds = { min: lo, max: hi };

    let cs = Math.max(cellMm, 0.5);
    let nx = 1, ny = 1, nz = 1;
    for (let guard = 0; guard < 40; guard++) {
      nx = Math.max(1, Math.ceil((hi[0] - lo[0]) / cs));
      ny = Math.max(1, Math.ceil((hi[1] - lo[1]) / cs));
      nz = Math.max(1, Math.ceil((hi[2] - lo[2]) / cs));
      if (nx * ny * nz <= 200_000) break;
      cs *= 1.26;
    }
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.inv = 1 / cs;

    const cells = nx * ny * nz;
    const counts = new Int32Array(cells + 1);
    const range = (b: Box3) => {
      const clampi = (v: number, n: number) => (v < 0 ? 0 : v > n - 1 ? n - 1 : v);
      return [
        clampi(Math.floor((b.min[0] - lo[0]) * this.inv), nx), clampi(Math.floor((b.max[0] - lo[0]) * this.inv), nx),
        clampi(Math.floor((b.min[1] - lo[1]) * this.inv), ny), clampi(Math.floor((b.max[1] - lo[1]) * this.inv), ny),
        clampi(Math.floor((b.min[2] - lo[2]) * this.inv), nz), clampi(Math.floor((b.max[2] - lo[2]) * this.inv), nz),
      ] as const;
    };
    for (const b of boxes) {
      const [i0, i1, j0, j1, k0, k1] = range(b);
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) counts[i + nx * (j + ny * k) + 1]++;
    }
    for (let c = 0; c < cells; c++) counts[c + 1] += counts[c];
    this.starts = counts;
    this.items = new Int32Array(counts[cells]);
    const cursor = counts.slice(0, cells);
    boxes.forEach((b, n) => {
      const [i0, i1, j0, j1, k0, k1] = range(b);
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.items[cursor[i + nx * (j + ny * k)]++] = n;
    });
  }

  /** True if any item might reach into the box (it may say yes for an item that only reaches a neighbouring part of a cell). */
  anyIn(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    const { min, max } = this.bounds;
    if (x1 < min[0] || x0 > max[0] || y1 < min[1] || y0 > max[1] || z1 < min[2] || z0 > max[2]) return false;
    const lo = (v: number, a: number, n: number) => Math.min(Math.max(Math.floor((v - min[a]) * this.inv), 0), n - 1);
    const i0 = lo(x0, 0, this.nx), i1 = lo(x1, 0, this.nx);
    const j0 = lo(y0, 1, this.ny), j1 = lo(y1, 1, this.ny);
    const k0 = lo(z0, 2, this.nz), k1 = lo(z1, 2, this.nz);
    for (let k = k0; k <= k1; k++) {
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const c = i + this.nx * (j + this.ny * k);
          if (this.starts[c + 1] > this.starts[c]) return true;
        }
      }
    }
    return false;
  }

  /** The cell holding this point, or -1 if it is outside every item's box. */
  cellOf(x: number, y: number, z: number): number {
    const { min, max } = this.bounds;
    if (x < min[0] || x > max[0] || y < min[1] || y > max[1] || z < min[2] || z > max[2]) return -1;
    let i = ((x - min[0]) * this.inv) | 0;
    let j = ((y - min[1]) * this.inv) | 0;
    let k = ((z - min[2]) * this.inv) | 0;
    if (i >= this.nx) i = this.nx - 1;
    if (j >= this.ny) j = this.ny - 1;
    if (k >= this.nz) k = this.nz - 1;
    return i + this.nx * (j + this.ny * k);
  }
}

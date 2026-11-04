import type { Vec2, Vec3 } from './vec';

/** An axis-aligned box in 3D, millimetres. */
export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** Bounding box of a list of points. An empty list gives an all-zero box. */
export function bbox(pts: readonly Vec2[]): BBox {
  if (pts.length === 0) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0, cx: 0, cy: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** A box that contains nothing. Growing it with any point gives that point's box. */
export function emptyBox(): Box3 {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function boxIsEmpty(b: Box3): boolean {
  return b.min[0] > b.max[0] || b.min[1] > b.max[1] || b.min[2] > b.max[2];
}

/** Grows `b` in place so it also contains the box (x0, y0, z0)-(x1, y1, z1). */
export function growBox(b: Box3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  if (x0 < b.min[0]) b.min[0] = x0;
  if (y0 < b.min[1]) b.min[1] = y0;
  if (z0 < b.min[2]) b.min[2] = z0;
  if (x1 > b.max[0]) b.max[0] = x1;
  if (y1 > b.max[1]) b.max[1] = y1;
  if (z1 > b.max[2]) b.max[2] = z1;
}

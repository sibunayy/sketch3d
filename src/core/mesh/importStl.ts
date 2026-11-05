import { BUILD_MM } from '../doc/types';
import type { PartMesh } from '../doc/types';
import { bbox } from '../geom/bounds';
import type { Vec2, Vec3 } from '../geom/vec';
import { buildMeshGrid } from './meshGrid';
import { parseStl } from './stlRead';

/** A shape opened from a file, ready to become a part. */
export interface ImportedShape {
  name: string;
  /** The shape seen from the front: its outline box is where the part sits (x around 0, y from 0 up). */
  outline: Vec2[];
  /** How deep the shape is, front to back, millimetres. */
  depthMm: number;
  mesh: PartMesh;
  /** What the file was multiplied by to fit: 1 when unchanged, less than 1 when made smaller. */
  scale: number;
  /** True when the file's surface has gaps, so it may not print well. */
  hasGaps: boolean;
  triangles: number;
}

/** Biggest side of a shape that was too big, after it is made smaller. Leaves room to grow before the toy limit. */
const FIT_MM = 80;
/** A shape smaller than this is made bigger, because it is probably in the wrong units. */
const TINY_MM = 2;
const TINY_TARGET_MM = 20;
const MAX_OUTLINE_POINTS = 48;

/** Opens an STL file's bytes as a shape. Throws StlError (with a message a child can read) if it cannot. */
export function importStl(buf: ArrayBuffer, name: string): ImportedShape {
  return shapeFromTriangles(parseStl(buf), name);
}

/**
 * Turns triangles (nine numbers each, in printer coordinates: z up) into a shape. A toy has y up and z towards
 * the viewer, so each point goes from (x, y, z) to (x, z, -y). The shape is centred left to right and front to
 * back, and stands on the floor (y = 0).
 */
export function shapeFromTriangles(raw: Float32Array, name: string): ImportedShape {
  const n = raw.length / 9;
  const pos = new Float32Array(raw.length);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i];
    const y = raw[i + 2];
    const z = -raw[i + 1];
    pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const longest = Math.max(x1 - x0, y1 - y0, z1 - z0);
  let scale = 1;
  if (longest > BUILD_MM) scale = FIT_MM / longest;
  else if (longest < TINY_MM) scale = TINY_TARGET_MM / Math.max(longest, 1e-6);

  // scale, and move so the middle of the box is the origin
  const cx = ((x0 + x1) / 2) * scale, cy = ((y0 + y1) / 2) * scale, cz = ((z0 + z1) / 2) * scale;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = pos[i] * scale - cx;
    pos[i + 1] = pos[i + 1] * scale - cy;
    pos[i + 2] = pos[i + 2] * scale - cz;
  }
  const size: Vec3 = [Math.max((x1 - x0) * scale, 0.5), Math.max((y1 - y0) * scale, 0.5), Math.max((z1 - z0) * scale, 0.5)];
  const hasGaps = !isClosed(pos);
  const mesh = buildMeshGrid(pos, size);

  // the outline sits with the shape's feet on the floor
  const lift = size[1] / 2;
  const outline = frontOutline(pos, size, lift);
  return {
    name,
    outline,
    depthMm: Math.max(size[2], 1),
    mesh,
    scale,
    hasGaps,
    triangles: n,
  };
}

/** True if every edge of the surface is shared by two triangles. Corners are matched to a thousandth of a millimetre. */
function isClosed(pos: Float32Array): boolean {
  const ids = new Map<string, number>();
  const idOf = (i: number): number => {
    const key = `${Math.round(pos[i] * 1000)},${Math.round(pos[i + 1] * 1000)},${Math.round(pos[i + 2] * 1000)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };
  const counts = new Map<number, number>();
  const total = pos.length / 3;
  const N = total + 1;
  for (let t = 0; t < total; t += 3) {
    const a = idOf(t * 3), b = idOf(t * 3 + 3), c = idOf(t * 3 + 6);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      if (p === q) continue;
      const key = p < q ? p * N + q : q * N + p;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (const c of counts.values()) if (c % 2 !== 0) return false;
  return true;
}

/** The shape as seen from the front: its outline (simplified), keeping the four extreme points so the box is exact. */
function frontOutline(pos: Float32Array, size: Vec3, lift: number): Vec2[] {
  const seen = new Set<string>();
  const pts: Vec2[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1] + lift;
    const key = `${Math.round(x * 20)},${Math.round(y * 20)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push([x, y]);
  }
  let hull = convexHull(pts);
  if (hull.length < 3 || bboxTooSmall(hull)) {
    const w = Math.max(size[0], 1) / 2;
    const h = Math.max(size[1], 1);
    return [[-w, 0], [w, 0], [w, h], [-w, h]];
  }
  hull = simplify(hull, MAX_OUTLINE_POINTS);
  return hull;
}

function bboxTooSmall(h: Vec2[]): boolean {
  const b = bbox(h);
  return b.w < 0.5 || b.h < 0.5;
}

/** Convex hull, counter-clockwise (Andrew's monotone chain). */
function convexHull(points: Vec2[]): Vec2[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Drops the points that change the shape least, until at most `max` are left. The four extreme points stay. */
function simplify(hull: Vec2[], max: number): Vec2[] {
  if (hull.length <= max) return hull;
  const pinned = new Set<Vec2>();
  for (const pick of [
    (a: Vec2, b: Vec2) => a[0] < b[0],
    (a: Vec2, b: Vec2) => a[0] > b[0],
    (a: Vec2, b: Vec2) => a[1] < b[1],
    (a: Vec2, b: Vec2) => a[1] > b[1],
  ]) {
    let best = hull[0];
    for (const q of hull) if (pick(q, best)) best = q;
    pinned.add(best);
  }
  const pts = hull.slice();
  const area = (a: Vec2, b: Vec2, c: Vec2) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  while (pts.length > max) {
    let bi = -1;
    let ba = Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pinned.has(pts[i])) continue;
      const a = area(pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]);
      if (a < ba) {
        ba = a;
        bi = i;
      }
    }
    if (bi < 0) break;
    pts.splice(bi, 1);
  }
  return pts;
}

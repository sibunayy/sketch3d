import { bbox } from './bounds';
import { clamp } from './vec';
import type { Vec2 } from './vec';

/**
 * Outline maths: closed loops of points in millimetres, y up.
 * A loop is closed implicitly (the last point joins back to the first; it is not repeated).
 * Ported from the prototype's part2.js and fix.js.
 */

export const MIN_OUTLINE_AREA_MM2 = 4;
const MAX_OUTLINE_POINTS = 160;

const isFinitePoint = (p: Vec2): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Area of the loop. Positive when the points go counter-clockwise. */
export function signedArea(pts: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Length of the loop, including the closing segment. */
export function perimeter(pts: readonly Vec2[]): number {
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

/** Drops points closer than `eps` to the one before, and a last point that sits on the first. */
export function dedupeClose(pts: readonly Vec2[], eps: number): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}

/** `n` points spaced evenly along the loop. */
export function resampleClosed(pts: readonly Vec2[], n: number): Vec2[] {
  const m = pts.length;
  if (m === 0 || n <= 0) return [];
  if (m === 1) return Array.from({ length: n }, () => [pts[0][0], pts[0][1]] as Vec2);
  const cum = [0];
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const L = cum[m];
  const out: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = (k * L) / n;
    while (j < m - 1 && cum[j + 1] < t) j++;
    const a = pts[j];
    const b = pts[(j + 1) % m];
    const s = cum[j + 1] - cum[j];
    const u = s > 0 ? (t - cum[j]) / s : 0;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

/** Corner-cutting smoothing: each pass rounds every corner. */
export function chaikin(pts: readonly Vec2[], passes: number): Vec2[] {
  let p: Vec2[] = pts.map((q) => [q[0], q[1]]);
  for (let k = 0; k < passes; k++) {
    const out: Vec2[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    p = out;
  }
  return p;
}

/** Averages each point with its neighbours, which removes hand jitter. */
function relax(pts: readonly Vec2[], passes: number): Vec2[] {
  let p: Vec2[] = pts.map((q) => [q[0], q[1]]);
  for (let k = 0; k < passes; k++) {
    const n = p.length;
    p = p.map((a, i) => {
      const b = p[(i + n - 1) % n];
      const c = p[(i + 1) % n];
      return [(b[0] + 2 * a[0] + c[0]) / 4, (b[1] + 2 * a[1] + c[1]) / 4];
    });
  }
  return p;
}

/** Where two segments properly cross (touching at an end does not count), or null. */
function segmentCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  if (t <= 1e-9 || t >= 1 - 1e-9 || u <= 1e-9 || u >= 1 - 1e-9) return null;
  return [a[0] + t * rx, a[1] + t * ry];
}

export interface Crossing {
  /** Index of the first segment (it runs from point i to i + 1). */
  i: number;
  /** Index of the second segment. */
  j: number;
  at: Vec2;
}

/** The first place the loop crosses itself, or null. Checks every pair of segments (n is small). */
export function findCrossing(p: readonly Vec2[]): Crossing | null {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const at = segmentCross(a, b, p[j], p[(j + 1) % n]);
      if (at) return { i, j, at };
    }
  }
  return null;
}

/** A crossing splits the loop in two. Keep the bigger loop and drop the twisted tail. */
function removeCrossings(start: Vec2[]): Vec2[] {
  let p = start;
  for (let k = 0; k < 60; k++) {
    const c = findCrossing(p);
    if (!c) return p;
    const A: Vec2[] = [c.at, ...p.slice(c.i + 1, c.j + 1)];
    const B: Vec2[] = [c.at, ...p.slice(c.j + 1), ...p.slice(0, c.i + 1)];
    p = dedupeClose(Math.abs(signedArea(A)) >= Math.abs(signedArea(B)) ? A : B, 0.02);
  }
  return p;
}

/** Removes points where the outline doubles straight back on itself. */
function despike(start: Vec2[]): Vec2[] {
  const p = start;
  let again = true;
  for (let guard = 0; again && guard < 30 && p.length > 3; guard++) {
    again = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length];
      const b = p[i];
      const c = p[(i + 1) % p.length];
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const vx = c[0] - b[0], vy = c[1] - b[1];
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      if (lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) < -0.985) {
        p.splice(i, 1);
        again = true;
        break;
      }
    }
  }
  return p;
}

const counterClockwise = (p: Vec2[]): Vec2[] => (signedArea(p) < 0 ? p.slice().reverse() : p);

/**
 * Cleans an outline: removes repeated points, untwists self-crossings (keeping the bigger loop),
 * removes spikes, makes it counter-clockwise and limits it to 160 points.
 * Returns null if it is not a usable shape (fewer than 3 points, or under 4 mm²). Never throws.
 */
export function repairOutline(pts: readonly Vec2[]): Vec2[] | null {
  if (pts.length < 3 || !pts.every(isFinitePoint)) return null;
  let p = dedupeClose(pts, 0.05);
  if (p.length < 3) return null;
  p = removeCrossings(p);
  p = despike(dedupeClose(p, 0.05));
  if (p.length < 3) return null;
  p = counterClockwise(p);
  if (p.length > MAX_OUTLINE_POINTS) p = resampleClosed(p, MAX_OUTLINE_POINTS);
  return Math.abs(signedArea(p)) < MIN_OUTLINE_AREA_MM2 ? null : p;
}

export interface StrokeResult {
  outline: Vec2[];
  /** True if the stroke crossed itself and had to be untwisted. */
  untwisted: boolean;
}

/**
 * Turns a rough freehand stroke into a clean, smooth, closed, untwisted outline.
 * Returns null if the stroke is not a shape: too few points, a dot, a line, or almost no area.
 */
export function strokeToOutline(raw: readonly Vec2[]): StrokeResult | null {
  if (!Array.isArray(raw) || !raw.every(isFinitePoint)) return null;
  let p = dedupeClose(raw, 1e-3);
  if (p.length < 4) return null;
  const b = bbox(p);
  const d = Math.hypot(b.w, b.h);
  if (d < 4) return null;

  p = resampleClosed(p, clamp(Math.round(perimeter(p) / (d / 45)), 24, 90));
  p = relax(p, 3);
  p = chaikin(p, 2);
  p = resampleClosed(p, clamp(Math.round(perimeter(p) / (d / 70)), 64, 120));

  const untwisted = findCrossing(dedupeClose(p, 0.02)) !== null;
  const outline = repairOutline(p);
  if (!outline) return null;
  if (Math.abs(signedArea(outline)) < d * d * 0.02) return null;
  return { outline, untwisted };
}

/** Same as strokeToOutline, for callers that do not need to know about untwisting. */
export function smoothStroke(raw: readonly Vec2[]): Vec2[] | null {
  return strokeToOutline(raw)?.outline ?? null;
}

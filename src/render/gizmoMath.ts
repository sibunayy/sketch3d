import type { Vec3 } from '../core/geom/vec';
import type { OrbitCamera } from './camera';
import { projectToScreen } from './picking';
import type { Ray } from './picking';

export type Axis = 'x' | 'y' | 'z';
export const AXES: Record<Axis, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** How far along an axis line (starting at `origin`) the closest point to the ray is. */
function closestOnAxis(origin: Vec3, axis: Vec3, ray: Ray): number {
  const w = sub(origin, ray.origin);
  const b = dot(axis, ray.dir);
  const d = dot(axis, w);
  const e = dot(ray.dir, w);
  const denom = 1 - b * b; // both directions are unit length
  if (Math.abs(denom) < 1e-6) return 0; // the ray runs along the axis: no way to tell
  return (b * e - d) / denom;
}

/** How far the finger moved along an arrow, in millimetres, between the ray at the start and the ray now. */
export function arrowDelta(origin: Vec3, axis: Axis, start: Ray, now: Ray): number {
  const a = AXES[axis];
  return closestOnAxis(origin, a, now) - closestOnAxis(origin, a, start);
}

function planePoint(ray: Ray, point: Vec3, normal: Vec3): Vec3 | null {
  const denom = dot(normal, ray.dir);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(normal, sub(point, ray.origin)) / denom;
  if (t < 0) return null;
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, ray.origin[2] + ray.dir[2] * t];
}

/** How many degrees the finger swept round a ring (positive turns the way a positive angle turns the part). */
export function ringAngleDeg(centre: Vec3, axis: Axis, start: Ray, now: Ray): number {
  const n = AXES[axis];
  const a = planePoint(start, centre, n);
  const b = planePoint(now, centre, n);
  if (!a || !b) return 0;
  const va = sub(a, centre);
  const vb = sub(b, centre);
  if (Math.hypot(...va) < 1e-6 || Math.hypot(...vb) < 1e-6) return 0;
  const angle = Math.atan2(dot(n, cross(va, vb)), dot(va, vb));
  return (angle * 180) / Math.PI;
}

/** Resizing: how much further from (or closer to) the middle the finger is now than it was at the start. */
export function scaleFactor(centre: [number, number], start: [number, number], now: [number, number]): number {
  const d0 = Math.hypot(start[0] - centre[0], start[1] - centre[1]);
  if (d0 < 1e-6) return 1;
  const k = Math.hypot(now[0] - centre[0], now[1] - centre[1]) / d0;
  return Math.min(5, Math.max(0.2, k));
}

export type HandleHit = { kind: 'move'; axis: Axis } | { kind: 'turn'; axis: Axis } | { kind: 'resize' };

/** How near (in pixels) a finger must be to a handle to take hold of it. A child's fingertip on an iPad is about 40 px wide. */
export const HANDLE_REACH_PX = 44;
/** An arrow counts as this much closer than it is, so a touch near both an arrow and a ring picks the arrow (moving is the usual job). */
const ARROW_BIAS = 0.8;
/** Where an arrow starts and ends, as a share of the gizmo size. A finger is measured against the whole line between them. */
const ARROW_FROM = 0.3;
const ARROW_TO = 1;
const RING_POINTS = 48;

/** Where the three handle families are, so drawing and finger-hit tests agree. */
export function handlePoints(centre: Vec3, size: number) {
  const arrows = (['x', 'y', 'z'] as Axis[]).map((axis) => ({
    axis,
    points: [ARROW_FROM, ARROW_TO].map((t): Vec3 => [centre[0] + AXES[axis][0] * size * t, centre[1] + AXES[axis][1] * size * t, centre[2] + AXES[axis][2] * size * t]),
  }));
  const rings = (['x', 'y', 'z'] as Axis[]).map((axis) => {
    const r = size * 0.72;
    const points: Vec3[] = [];
    for (let i = 0; i < RING_POINTS; i++) {
      const t = (i / RING_POINTS) * Math.PI * 2;
      const c = Math.cos(t) * r;
      const s = Math.sin(t) * r;
      points.push(axis === 'x' ? [centre[0], centre[1] + c, centre[2] + s] : axis === 'y' ? [centre[0] + c, centre[1], centre[2] + s] : [centre[0] + c, centre[1] + s, centre[2]]);
    }
    return { axis, points };
  });
  const cube: Vec3 = [centre[0] - size * 0.42, centre[1] + size * 0.42, centre[2] + size * 0.42];
  return { arrows, rings, cube };
}

/** How far point `p` is from the line segment `a`-`b`, in the same units. */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Which handle a finger at `screen` is on, if any: the nearest one in reach (arrows count as a little nearer than they are, so they win a near tie with a ring). */
export function hitHandle(cam: OrbitCamera, fovDeg: number, aspect: number, width: number, height: number, centre: Vec3, size: number, screen: [number, number]): HandleHit | null {
  const h = handlePoints(centre, size);
  const near = (p: Vec3) => {
    const s = projectToScreen(cam, fovDeg, aspect, width, height, p);
    return s ? Math.hypot(s[0] - screen[0], s[1] - screen[1]) : Infinity;
  };
  /** Screen distance from the finger to the line through these points (a closed loop if `loop`). */
  const nearLine = (points: Vec3[], loop: boolean) => {
    const pts = points.map((p) => projectToScreen(cam, fovDeg, aspect, width, height, p));
    let d = Infinity;
    for (let i = 0; i < pts.length - (loop ? 0 : 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a && b) d = Math.min(d, segmentDistance(screen, a, b));
    }
    return d;
  };
  const candidates: { hit: HandleHit; d: number }[] = [
    { hit: { kind: 'resize' }, d: near(h.cube) },
    ...h.arrows.map((a) => ({ hit: { kind: 'move', axis: a.axis } as HandleHit, d: nearLine(a.points, false) * ARROW_BIAS })),
    ...h.rings.map((r) => ({ hit: { kind: 'turn', axis: r.axis } as HandleHit, d: nearLine(r.points, true) })),
  ];
  let best: { hit: HandleHit; d: number } | null = null;
  for (const c of candidates) if (c.d <= HANDLE_REACH_PX && (best === null || c.d < best.d)) best = c;
  return best === null ? null : best.hit;
}

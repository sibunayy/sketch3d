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

/** How near (in pixels) a finger must be to a handle to take hold of it. Fingers are big. */
export const HANDLE_REACH_PX = 28;
const RING_POINTS = 48;

/** Where the three handle families are, so drawing and finger-hit tests agree. */
export function handlePoints(centre: Vec3, size: number) {
  const arrows = (['x', 'y', 'z'] as Axis[]).map((axis) => ({
    axis,
    points: [0.45, 0.7, 1].map((t): Vec3 => [centre[0] + AXES[axis][0] * size * t, centre[1] + AXES[axis][1] * size * t, centre[2] + AXES[axis][2] * size * t]),
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

/** Which handle a finger at `screen` is on, if any. The cube wins over arrows, and arrows over rings. */
export function hitHandle(cam: OrbitCamera, fovDeg: number, aspect: number, width: number, height: number, centre: Vec3, size: number, screen: [number, number]): HandleHit | null {
  const h = handlePoints(centre, size);
  const near = (p: Vec3) => {
    const s = projectToScreen(cam, fovDeg, aspect, width, height, p);
    return s ? Math.hypot(s[0] - screen[0], s[1] - screen[1]) : Infinity;
  };
  if (near(h.cube) <= HANDLE_REACH_PX) return { kind: 'resize' };
  let best: { hit: HandleHit; d: number } | null = null;
  for (const a of h.arrows) {
    const d = Math.min(...a.points.map(near));
    if (d <= HANDLE_REACH_PX && (!best || d < best.d)) best = { hit: { kind: 'move', axis: a.axis }, d };
  }
  if (best) return best.hit;
  for (const r of h.rings) {
    const d = Math.min(...r.points.map(near));
    if (d <= HANDLE_REACH_PX && (!best || d < best.d)) best = { hit: { kind: 'turn', axis: r.axis }, d };
  }
  return best ? best.hit : null;
}

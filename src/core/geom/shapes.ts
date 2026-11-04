import type { PartKind } from '../doc/types';
import { bbox } from './bounds';
import { chaikin, dedupeClose, resampleClosed, signedArea } from './outline';
import { clamp } from './vec';
import type { Vec2 } from './vec';

/** The ready-made shapes. Each fills the box (x0, y0) to (x1, y1) and goes counter-clockwise. */
export type ShapeName = 'circle' | 'box' | 'star' | 'heart' | 'egg' | 'capsule' | 'triangle' | 'drop' | 'moon';
export type ShapeFn = (x0: number, y0: number, x1: number, y1: number) => Vec2[];

/** Stretches a shape so its bounding box is exactly the given box. */
function fit(p: Vec2[], x0: number, y0: number, x1: number, y1: number): Vec2[] {
  const b = bbox(p);
  const sx = b.w ? (x1 - x0) / b.w : 1;
  const sy = b.h ? (y1 - y0) / b.h : 1;
  return p.map((q) => [x0 + (q[0] - b.x0) * sx, y0 + (q[1] - b.y0) * sy]);
}

const ccw = (p: Vec2[]): Vec2[] => (signedArea(p) < 0 ? p.reverse() : p);

/** Four rounded corners of radius r, each drawn with `steps` segments. */
function roundedBox(x0: number, y0: number, x1: number, y1: number, r: number, steps: number): Vec2[] {
  const out: Vec2[] = [];
  const corners: [number, number, number][] = [
    [x1 - r, y1 - r, 0],
    [x0 + r, y1 - r, 90],
    [x0 + r, y0 + r, 180],
    [x1 - r, y0 + r, 270],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= steps; k++) {
      const a = ((a0 + (k * 90) / steps) * Math.PI) / 180;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  // a capsule's round ends meet its sides at the same point, so drop the repeats
  return dedupeClose(out, 1e-9);
}

export const SHAPES: Record<ShapeName, ShapeFn> = {
  circle: (x0, y0, x1, y1) => {
    const n = 72;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Vec2;
    });
  },

  box: (x0, y0, x1, y1) => roundedBox(x0, y0, x1, y1, Math.min(x1 - x0, y1 - y0) * 0.22, 8),

  star: (x0, y0, x1, y1) => {
    const o: Vec2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.48 : 1;
      o.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return ccw(fit(resampleClosed(chaikin(o, 2), 90), x0, y0, x1, y1));
  },

  heart: (x0, y0, x1, y1) => {
    const o: Vec2[] = [];
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      o.push([
        16 * Math.pow(Math.sin(t), 3),
        13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
      ]);
    }
    return ccw(fit(o, x0, y0, x1, y1));
  },

  egg: (x0, y0, x1, y1) => {
    const o: Vec2[] = [];
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      o.push([Math.cos(t) * (1 - 0.2 * Math.sin(t)), Math.sin(t)]);
    }
    return ccw(fit(o, x0, y0, x1, y1));
  },

  capsule: (x0, y0, x1, y1) => roundedBox(x0, y0, x1, y1, Math.min(x1 - x0, y1 - y0) / 2, 12),

  triangle: (x0, y0, x1, y1) => ccw(fit(resampleClosed(chaikin([[0, 1], [-1, -1], [1, -1]], 4), 90), x0, y0, x1, y1)),

  drop: (x0, y0, x1, y1) => {
    const o: Vec2[] = [];
    for (let i = 0; i < 80; i++) {
      const t = (i / 80) * Math.PI * 2;
      o.push([Math.sin(t) * Math.pow(Math.sin(t / 2), 1.4), Math.cos(t)]);
    }
    return ccw(fit(o, x0, y0, x1, y1));
  },

  moon: (x0, y0, x1, y1) => {
    const o: Vec2[] = [];
    const d = 0.5, r1 = 0.85;
    const xi = (1 - r1 * r1 + d * d) / (2 * d);
    const al = Math.atan2(Math.sqrt(1 - xi * xi), xi);
    for (let i = 0; i <= 40; i++) {
      const a = al + ((2 * Math.PI - 2 * al) * i) / 40;
      o.push([Math.cos(a), Math.sin(a)]);
    }
    const b0 = Math.atan2(-Math.sqrt(1 - xi * xi), xi - d) + 2 * Math.PI;
    const b1 = Math.atan2(Math.sqrt(1 - xi * xi), xi - d);
    for (let i = 1; i < 40; i++) {
      const a = b0 + ((b1 - b0) * i) / 40;
      o.push([d + r1 * Math.cos(a), r1 * Math.sin(a)]);
    }
    return ccw(fit(o, x0, y0, x1, y1));
  },
};

/**
 * How thick and how round a new part should be.
 * A circle becomes a ball as thick as it is wide. Anything else gets 0.7 of its narrowest side,
 * kept between 12 and 60 mm, with soft edges.
 */
export function defaultThickness(kind: PartKind, outline: readonly Vec2[]): { depthMm: number; round: number } {
  const b = bbox(outline);
  if (kind === 'circle') return { depthMm: clamp(Math.round(Math.max(b.w, b.h)), 8, 80), round: 1 };
  return { depthMm: clamp(Math.round(Math.min(b.w, b.h) * 0.7), 12, 60), round: 0.7 };
}

import { bbox } from '../geom/bounds';
import type { Vec3 } from '../geom/vec';
import type { Part } from './types';

/** Row-major 3x3 matrix. */
export type Mat3 = readonly number[];

/** The space a part's sculpt dabs live in: where the part is, how big, and how it is turned. */
export interface PartFrame {
  origin: Vec3;
  size: Vec3;
  rot: Mat3;
}

const D2R = Math.PI / 180;

/** R = Rz * Ry * Rx, angles in degrees. This is the prototype's convention. */
export function rotationMatrix(rot: { x: number; y: number; z: number }): Mat3 {
  const a = rot.x * D2R;
  const b = rot.y * D2R;
  const g = rot.z * D2R;
  if (!a && !b && !g) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);
  return [
    cg * cb, cg * sb * sa - sg * ca, cg * sb * ca + sg * sa,
    sg * cb, sg * sb * sa + cg * ca, sg * sb * ca - cg * sa,
    -sb, cb * sa, cb * ca,
  ];
}

export function partFrame(p: Pick<Part, 'outline' | 'z' | 'depthMm' | 'rot'>): PartFrame {
  const b = bbox(p.outline);
  return {
    origin: [b.cx, b.cy, p.z],
    size: [Math.max(b.w, 1), Math.max(b.h, 1), Math.max(p.depthMm, 1)],
    rot: rotationMatrix(p.rot),
  };
}

/** R * v */
const apply = (R: Mat3, v: Vec3): Vec3 => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
];

/** Rᵀ * v */
const applyT = (R: Mat3, v: Vec3): Vec3 => [
  R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
  R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
  R[2] * v[0] + R[5] * v[1] + R[8] * v[2],
];

/** A direction or offset (no translation) from world millimetres to local units. */
export function dirToLocal(f: PartFrame, v: Vec3): Vec3 {
  const r = applyT(f.rot, v);
  return [r[0] / f.size[0], r[1] / f.size[1], r[2] / f.size[2]];
}

export function dirToWorld(f: PartFrame, v: Vec3): Vec3 {
  return apply(f.rot, [v[0] * f.size[0], v[1] * f.size[1], v[2] * f.size[2]]);
}

export function worldToLocal(f: PartFrame, w: Vec3): Vec3 {
  return dirToLocal(f, [w[0] - f.origin[0], w[1] - f.origin[1], w[2] - f.origin[2]]);
}

export function localToWorld(f: PartFrame, l: Vec3): Vec3 {
  const d = dirToWorld(f, l);
  return [d[0] + f.origin[0], d[1] + f.origin[1], d[2] + f.origin[2]];
}

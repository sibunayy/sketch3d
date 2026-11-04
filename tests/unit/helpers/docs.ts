import type { Doc, Part } from '../../../src/core/doc/types';
import type { Vec2 } from '../../../src/core/geom/vec';

/** A rectangle outline, w by h, centred on (cx, cy). */
export function rect(w: number, h: number, cx = 0, cy = 0): Vec2[] {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

export function makePart(over: Partial<Part> = {}): Part {
  return {
    id: 'p1',
    name: 'Body',
    kind: 'box',
    outline: rect(20, 20),
    color: '#e5484d',
    depthMm: 16,
    round: 0.7,
    z: 0,
    blend: 0,
    melt: false,
    cut: false,
    rot: { x: 0, y: 0, z: 0 },
    taper: 0,
    squash: 0,
    ...over,
  };
}

export function makeDoc(parts: Part[] = [makePart()]): Doc {
  return {
    version: 3,
    parts,
    dabs: [],
    grooves: [],
    settings: { symmetry: true, build: { w: 110, h: 110, d: 70 } },
  };
}

/** Words a child should never see in an error message. */
export const JARGON =
  /\b(nan|undefined|null|json|schema|vertex|vertices|mesh|sdf|extrude|extrusion|boolean|parametric|manifold|typeerror|array|object|invalid|expected|property|field|stack)\b/i;

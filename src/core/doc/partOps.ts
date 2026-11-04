import { bbox } from '../geom/bounds';
import { effectiveParts } from '../geom/scene';
import { dedupeClose, repairOutline, signedArea } from '../geom/outline';
import { defaultThickness } from '../geom/shapes';
import type { Vec2 } from '../geom/vec';
import type { Doc, Part, PartKind } from './types';
import { PROFILE_SAMPLES } from './types';

/** Colours new parts take in turn. */
export const PALETTE = ['#e5484d', '#f76808', '#f5c518', '#46a758', '#12a594', '#0091ff', '#6e56cf', '#e93d82', '#8b5a3c', '#ece7df', '#889096', '#1c2024'] as const;

const KIND_NAME: Record<PartKind, string> = {
  circle: 'Circle', box: 'Box', star: 'Star', heart: 'Heart', egg: 'Egg', capsule: 'Capsule', triangle: 'Triangle',
  drop: 'Drop', moon: 'Moon', draw: 'Drawing', limb: 'Limb', eyes: 'Eye', smile: 'Smile',
};

export interface NewPartSpec {
  kind: PartKind;
  outline: Vec2[];
  /** A hole or slot: it removes material. */
  cut?: boolean;
  color?: string;
  depthMm?: number;
  z?: number;
  round?: number;
  name?: string;
}

/** A new id that no part has had in this document. */
function freshId(doc: Doc): string {
  let n = 1;
  for (const p of doc.parts) {
    const m = /^p(\d+)$/.exec(p.id);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  let id = `p${n}`;
  while (doc.parts.some((p) => p.id === id)) id = `p${++n}`;
  return id;
}

function nameFor(doc: Doc, kind: PartKind, cut: boolean): string {
  const base = cut ? 'Hole' : KIND_NAME[kind];
  const used = doc.parts.filter((p) => p.name.startsWith(base + ' ')).length;
  return `${base} ${used + 1}`;
}

/**
 * Where a new part should sit front to back: just in front of whatever it overlaps (so faces do not
 * fight), or in the middle if it overlaps nothing.
 */
function autoZ(doc: Doc, outline: Vec2[], depthMm: number): number {
  const b = bbox(outline);
  let front: number | null = null;
  for (const p of doc.parts) {
    if (p.cut || p.outline.length < 3) continue;
    const q = bbox(p.outline);
    if (q.x0 < b.x1 && q.x1 > b.x0 && q.y0 < b.y1 && q.y1 > b.y0) {
      const f = p.z + p.depthMm / 2;
      if (front === null || f > front) front = f;
    }
  }
  return front === null ? 0 : Math.round((front - 2 + depthMm / 2) * 10) / 10;
}

/** Builds a part with sensible thickness, roundness, colour and place. The caller adds it to the document. */
export function newPart(doc: Doc, spec: NewPartSpec): Part {
  const cut = !!spec.cut;
  const dflt = defaultThickness(spec.kind, spec.outline);
  const depthMm = cut ? spec.depthMm ?? 80 : spec.depthMm ?? dflt.depthMm;
  const solids = doc.parts.filter((p) => !p.cut).length;
  return {
    id: freshId(doc),
    name: spec.name ?? nameFor(doc, spec.kind, cut),
    kind: spec.kind,
    outline: spec.outline,
    color: cut ? '#e5484d' : spec.color ?? PALETTE[solids % PALETTE.length],
    depthMm: Math.min(200, Math.max(1, depthMm)),
    round: cut ? 0 : spec.round ?? dflt.round,
    z: cut ? spec.z ?? 0 : spec.z ?? autoZ(doc, spec.outline, depthMm),
    blend: 0,
    melt: false,
    cut,
    rot: { x: 0, y: 0, z: 0 },
    taper: 0,
    squash: 0,
  };
}

/** The shape of a part as seen from the side: depth (z) across, height (y) up. */
export function sideOutline(p: Part): Vec2[] {
  const b = bbox(p.outline);
  const h = p.depthMm / 2;
  if (!p.profile) return [[p.z - h, b.y0], [p.z + h, b.y0], [p.z + h, b.y1], [p.z - h, b.y1]];
  const front: Vec2[] = [];
  const back: Vec2[] = [];
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const y = b.y0 + ((b.y1 - b.y0) * i) / (PROFILE_SAMPLES - 1);
    front.push([p.z + p.profile.front[i] * h, y]);
    back.push([p.z + p.profile.back[i] * h, y]);
  }
  return [...back, ...front.reverse()];
}

function inside(poly: readonly Vec2[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The id of the top-most part under a point. In the Side view the point is (z, y). */
export function hitTest(doc: Doc, view: 'front' | 'side', at: Vec2): string | null {
  const parts = effectiveParts(doc);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.outline.length < 3) continue;
    const poly = view === 'front' ? p.outline : sideOutline(p);
    if (inside(poly, at[0], at[1])) return p.id;
  }
  return null;
}

/** A thick, round-ended band along a line: the outline of a tail or an arm. */
export function limbOutline(line: readonly Vec2[], radius: number): Vec2[] {
  let path = dedupeClose(line, 0.2);
  if (path.length < 2) {
    const [x, y] = line[0] ?? [0, 0];
    path = [[x, y], [x + radius, y]];
  }
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    left.push([path[i][0] - dy * radius, path[i][1] + dx * radius]);
    right.push([path[i][0] + dy * radius, path[i][1] - dx * radius]);
  }
  const cap = (centre: Vec2, from: Vec2, to: Vec2, steps = 6): Vec2[] => {
    const a0 = Math.atan2(from[1] - centre[1], from[0] - centre[0]);
    let a1 = Math.atan2(to[1] - centre[1], to[0] - centre[0]);
    while (a1 > a0) a1 -= 2 * Math.PI; // go the way that curves round the end
    const out: Vec2[] = [];
    for (let k = 1; k < steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      out.push([centre[0] + Math.cos(a) * radius, centre[1] + Math.sin(a) * radius]);
    }
    return out;
  };
  const end = path[path.length - 1];
  const start = path[0];
  let ring: Vec2[] = [...left, ...cap(end, left[left.length - 1], right[right.length - 1]), ...right.reverse(), ...cap(start, right[0], left[0])];
  ring = dedupeClose(ring, 0.01);
  // the inside of a tight bend can fold over itself: untwist it
  const clean = repairOutline(ring);
  if (clean) return clean;
  return signedArea(ring) < 0 ? ring.reverse() : ring;
}

/** A curved band, like a smile, centred on (cx, cy) and `width` wide. */
export function smileOutline(cx: number, cy: number, width: number): Vec2[] {
  const r = width * 0.75;
  const thick = Math.max(1.6, width * 0.14);
  const half = Math.asin(Math.min(1, width / 2 / r));
  const pts: Vec2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 - half + (2 * half * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + r + Math.sin(a) * r]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = -Math.PI / 2 - half + (2 * half * i) / steps;
    pts.push([cx + Math.cos(a) * (r - thick), cy + r + Math.sin(a) * (r - thick)]);
  }
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

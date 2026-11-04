import { clamp } from '../geom/vec';
import { LIMITS } from './schema';
import type { Doc, Part } from './types';

/** The things the settings panel can change on a part. */
export interface PartPatch {
  round?: number;
  depthMm?: number;
  blend?: number;
  melt?: boolean;
  taper?: number;
  squash?: number;
  color?: string;
  /** Any of the three angles; the ones left out stay as they were. */
  rot?: Partial<Part['rot']>;
}

/** The four roundness choices: Square, Soft, Round, Pill. */
export const ROUND_STEPS = [0.04, 0.4, 0.8, 1] as const;
/** The three melt amounts: A little, Some, A lot (millimetres). */
export const BLEND_STEPS = [3, 8, 15] as const;

export function nearestRound(v: number): number {
  return ROUND_STEPS.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best));
}

/**
 * Applies a change to the parts with these ids, in place. With symmetry on, a mirrored twin is only a
 * reflection of the part it follows, so changes to a twin go to that part (a turn is mirrored on the way).
 * Colour belongs to each part. Numbers outside the allowed range are squeezed in, not refused.
 */
export function applyPatch(doc: Doc, ids: readonly string[], patch: PartPatch): void {
  const byId = new Map(doc.parts.map((p) => [p.id, p]));
  const done = new Set<string>();
  for (const id of ids) {
    const picked = byId.get(id);
    if (!picked) continue;
    const mirrored = doc.settings.symmetry && picked.twinOf !== undefined && byId.has(picked.twinOf);
    const target = mirrored ? byId.get(picked.twinOf as string)! : picked;

    if (patch.color !== undefined) picked.color = patch.color; // each part keeps its own colour
    const key = `${target.id}|${mirrored}`;
    if (done.has(target.id) || done.has(key)) continue;
    done.add(target.id);
    done.add(key);

    if (patch.round !== undefined) target.round = clamp(patch.round, LIMITS.round[0], LIMITS.round[1]);
    if (patch.depthMm !== undefined) target.depthMm = clamp(patch.depthMm, LIMITS.depthMm[0], LIMITS.depthMm[1]);
    if (patch.blend !== undefined) target.blend = clamp(patch.blend, LIMITS.blend[0], LIMITS.blend[1]);
    if (patch.melt !== undefined) target.melt = patch.melt;
    if (patch.taper !== undefined) target.taper = clamp(patch.taper, LIMITS.percent[0], LIMITS.percent[1]);
    if (patch.squash !== undefined) target.squash = clamp(patch.squash, LIMITS.percent[0], LIMITS.percent[1]);
    if (patch.rot) {
      const flip = mirrored ? -1 : 1;
      const r = { ...target.rot };
      if (patch.rot.x !== undefined) r.x = patch.rot.x;
      if (patch.rot.y !== undefined) r.y = patch.rot.y * flip;
      if (patch.rot.z !== undefined) r.z = patch.rot.z * flip;
      target.rot = {
        x: clamp(r.x, LIMITS.rotDeg[0], LIMITS.rotDeg[1]),
        y: clamp(r.y, LIMITS.rotDeg[0], LIMITS.rotDeg[1]),
        z: clamp(r.z, LIMITS.rotDeg[0], LIMITS.rotDeg[1]),
      };
    }
  }
}

/** The value all these parts share, or "mixed" if they differ (or there are none). */
export function commonValue<T extends number | string | boolean>(parts: readonly Part[], read: (p: Part) => T): T | 'mixed' {
  if (parts.length === 0) return 'mixed';
  const first = read(parts[0]);
  for (const p of parts) {
    const v = read(p);
    if (typeof v === 'number' && typeof first === 'number') {
      if (Math.abs(v - first) > 1e-3) return 'mixed';
    } else if (v !== first) {
      return 'mixed';
    }
  }
  return first;
}

function freshId(doc: Doc): string {
  let n = 1;
  for (const p of doc.parts) {
    const m = /^p(\d+)$/.exec(p.id);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return `p${n}`;
}

/**
 * Adds a copy of each of the parts, a little to the side, and returns the new ids in the same order.
 * A part and its twin stay twins of each other; sculpting is copied along.
 */
export function copyParts(doc: Doc, ids: readonly string[]): string[] {
  const made = new Map<string, string>();
  const out: string[] = [];
  for (const id of ids) {
    const src = doc.parts.find((p) => p.id === id);
    if (!src) continue;
    const copy: Part = structuredClone(src);
    copy.id = freshId(doc);
    copy.name = `${src.name} copy`.slice(0, LIMITS.nameLength);
    copy.outline = copy.outline.map(([x, y]): [number, number] => [x + 8, y]);
    delete copy.twinOf;
    doc.parts.push(copy);
    made.set(id, copy.id);
    out.push(copy.id);
    for (const dab of doc.dabs.filter((d) => d.partId === id)) doc.dabs.push({ ...structuredClone(dab), partId: copy.id });
  }
  for (const id of ids) {
    const src = doc.parts.find((p) => p.id === id);
    const twin = src?.twinOf ? made.get(src.twinOf) : undefined;
    const copy = made.get(id);
    if (copy && twin) doc.parts.find((p) => p.id === copy)!.twinOf = twin;
  }
  return out;
}

/** Removes the parts, any twins that follow them, and their sculpting. */
export function deleteParts(doc: Doc, ids: readonly string[]): void {
  const gone = new Set(ids);
  for (const p of doc.parts) if (p.twinOf && gone.has(p.twinOf)) gone.add(p.id);
  doc.parts = doc.parts.filter((p) => !gone.has(p.id));
  doc.dabs = doc.dabs.filter((d) => !gone.has(d.partId));
}

// ---------- 3D handle edits (move, turn, resize) ----------

export type EditAxis = 'x' | 'y' | 'z';

/** With symmetry on, a twin is only a reflection, so edits go to the part it follows. */
export function editTarget(doc: Doc, id: string): { id: string; mirrored: boolean } | null {
  const p = doc.parts.find((q) => q.id === id);
  if (!p) return null;
  return doc.settings.symmetry && p.twinOf && doc.parts.some((q) => q.id === p.twinOf) ? { id: p.twinOf, mirrored: true } : { id, mirrored: false };
}

/** A part as it was when a drag began. Every drag step is worked out from this, so steps never add up errors. */
export interface PartSnapshot {
  /** The part that will really change (the one a twin follows). */
  id: string;
  mirrored: boolean;
  outline: Part['outline'];
  z: number;
  rot: Part['rot'];
  depthMm: number;
}

export function snapshotPart(doc: Doc, id: string): PartSnapshot | null {
  const t = editTarget(doc, id);
  const p = t && doc.parts.find((q) => q.id === t.id);
  if (!t || !p) return null;
  return { id: t.id, mirrored: t.mirrored, outline: p.outline.map((q) => [...q] as [number, number]), z: p.z, rot: { ...p.rot }, depthMm: p.depthMm };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Slides the part `amount` millimetres along a world axis from where it started. */
export function applyMove(doc: Doc, id: string, axis: EditAxis, amount: number, from: PartSnapshot): void {
  const p = doc.parts.find((q) => q.id === from.id);
  if (!p) return;
  const dx = axis === 'x' ? amount * (from.mirrored ? -1 : 1) : 0;
  const dy = axis === 'y' ? amount : 0;
  p.outline = from.outline.map(([x, y]): [number, number] => [r1(x + dx), r1(y + dy)]);
  p.z = axis === 'z' ? r1(from.z + amount) : from.z;
  void id;
}

/** Turns the part `deg` degrees about a world axis from the angles it started with. */
export function applyTurn(doc: Doc, id: string, axis: EditAxis, deg: number, fromRot: Part['rot']): void {
  const target = editTarget(doc, id);
  const p = target && doc.parts.find((q) => q.id === target.id);
  if (!target || !p) return;
  const flip = target.mirrored && axis !== 'x' ? -1 : 1; // a mirror image turns the other way
  const r = { ...fromRot };
  r[axis] = r1(fromRot[axis] + deg * flip);
  p.rot = { x: clamp(r.x, LIMITS.rotDeg[0], LIMITS.rotDeg[1]), y: clamp(r.y, LIMITS.rotDeg[0], LIMITS.rotDeg[1]), z: clamp(r.z, LIMITS.rotDeg[0], LIMITS.rotDeg[1]) };
}

/** Scales width, height and thickness together about the part's middle. */
export function applyResize(doc: Doc, id: string, k: number, from: PartSnapshot): void {
  const p = doc.parts.find((q) => q.id === from.id);
  if (!p) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of from.outline) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  p.outline = from.outline.map(([x, y]): [number, number] => [r1(cx + (x - cx) * k), r1(cy + (y - cy) * k)]);
  p.depthMm = clamp(r1(from.depthMm * k), LIMITS.depthMm[0], LIMITS.depthMm[1]);
  void id;
}

/**
 * Makes the whole toy `k` times as big or small (sizes, places, thickness, melt distance, sculpting and
 * creases) so it keeps its shape. Used by "Make it fit".
 */
export function scaleToy(doc: Doc, k: number): void {
  for (const p of doc.parts) {
    p.outline = p.outline.map(([x, y]): [number, number] => [r1(x * k), r1(y * k)]);
    p.z = r1(p.z * k);
    p.depthMm = clamp(r1(p.depthMm * k), LIMITS.depthMm[0], LIMITS.depthMm[1]);
    p.blend = clamp(r1(p.blend * k), LIMITS.blend[0], LIMITS.blend[1]);
  }
  for (const d of doc.dabs) d.radius = clamp(d.radius * k, LIMITS.dabRadius[0], LIMITS.dabRadius[1]);
  for (const g of doc.grooves) {
    g.points = g.points.map(([x, y, z]): [number, number, number] => [x * k, y * k, z * k]);
    g.radius = clamp(g.radius * k, LIMITS.grooveRadius[0], LIMITS.grooveRadius[1]);
  }
}

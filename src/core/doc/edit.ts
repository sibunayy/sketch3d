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

import { bbox } from '../geom/bounds';
import { catmullRom, clamp } from '../geom/vec';
import type { Vec2, Vec3 } from '../geom/vec';
import { dirToLocal, dirToWorld, localToWorld, partFrame, worldToLocal } from './frame';
import type { PartFrame } from './frame';
import { COLOR_PATTERN, DocError, LIMITS, cantOpen, createDoc, notAToy, validateDoc } from './schema';
import { DOC_VERSION, PROFILE_MAX, PROFILE_SAMPLES } from './types';
import type { Dab, DabType, Doc, Groove, Part, PartKind } from './types';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const num = (v: unknown, fallback: number): number => (isNum(v) ? v : fallback);
const range = (v: unknown, fallback: number, r: readonly [number, number]): number => clamp(num(v, fallback), r[0], r[1]);

function vec3(v: unknown): Vec3 | null {
  return Array.isArray(v) && v.length >= 3 && isNum(v[0]) && isNum(v[1]) && isNum(v[2]) ? [v[0], v[1], v[2]] : null;
}

/** Older numbered versions of Doc, keyed by the version they upgrade from. None exist yet: version 3 is the first. */
const UPGRADES: Record<number, (old: Rec) => Rec> = {};

/**
 * Turns any saved toy into a current Doc: the prototype's `sketch3d.v2` object,
 * an older numbered Doc, or a current Doc (which is just checked).
 * Throws DocError with a message a child can read.
 */
export function migrate(input: unknown): Doc {
  if (!isRec(input)) throw notAToy('not an object');

  if (typeof input.version === 'number') {
    let doc: Rec = input;
    let version = input.version;
    if (version > DOC_VERSION) {
      throw new DocError('This toy was made with a newer Sketch3D. Open it in the newest version.', `version ${version}`);
    }
    while (version < DOC_VERSION) {
      const step = UPGRADES[version];
      if (!step) throw cantOpen(`no upgrade from version ${version}`);
      doc = step(doc);
      version++;
    }
    return validateDoc(doc);
  }

  if (Array.isArray(input.parts)) return fromPrototype(input);
  throw notAToy('no parts');
}

// ---------------------------------------------------------------------------
// The prototype's save (localStorage key "sketch3d.v2")
// ---------------------------------------------------------------------------

const KIND_BY_NAME: [string, PartKind][] = [
  ['Circle', 'circle'], ['Box', 'box'], ['Star', 'star'], ['Heart', 'heart'], ['Egg', 'egg'],
  ['Capsule', 'capsule'], ['Triangle', 'triangle'], ['Drop', 'drop'], ['Moon', 'moon'],
  ['Limb', 'limb'], ['Eye', 'eyes'], ['Smile', 'smile'],
];

// The prototype saved only a name. Parts the user drew, and cut-away holes, count as "draw".
const guessKind = (name: string): PartKind => KIND_BY_NAME.find(([label]) => name.startsWith(label))?.[1] ?? 'draw';

/** The prototype stored the side profile as 9 control points; the new format has 64 samples. */
function convertProfile(prof: unknown): Part['profile'] {
  if (!isRec(prof) || !Array.isArray(prof.f) || !Array.isArray(prof.b)) return undefined;
  const f = prof.f.filter(isNum);
  const b = prof.b.filter(isNum);
  if (f.length < 2 || b.length < 2) return undefined;
  const sample = (a: number[]) =>
    Array.from({ length: PROFILE_SAMPLES }, (_, i) => clamp(catmullRom(a, i / (PROFILE_SAMPLES - 1)), -PROFILE_MAX, PROFILE_MAX));
  return { front: sample(f), back: sample(b) };
}

function convertPart(raw: unknown): Part | null {
  if (!isRec(raw) || typeof raw.id !== 'string' || !raw.id || !Array.isArray(raw.pts) || raw.pts.length < 3) return null;
  const outline: Vec2[] = [];
  for (const q of raw.pts) {
    if (!Array.isArray(q) || !isNum(q[0]) || !isNum(q[1])) return null;
    outline.push([q[0], q[1]]);
  }
  const name = typeof raw.name === 'string' && raw.name ? raw.name.slice(0, LIMITS.nameLength) : 'Part';
  const part: Part = {
    id: raw.id.slice(0, LIMITS.idLength),
    name,
    kind: guessKind(name),
    outline,
    color: typeof raw.color === 'string' && COLOR_PATTERN.test(raw.color) ? raw.color : '#889096',
    depthMm: range(raw.depth, 16, LIMITS.depthMm),
    round: range(raw.round, 0.7, LIMITS.round),
    z: range(raw.z, 0, LIMITS.z),
    blend: range(raw.blend, 0, LIMITS.blend),
    melt: !!raw.melt,
    cut: !!raw.cut,
    rot: { x: range(raw.rx, 0, LIMITS.rotDeg), y: range(raw.ry, 0, LIMITS.rotDeg), z: range(raw.rz, 0, LIMITS.rotDeg) },
    taper: range(raw.taper, 0, LIMITS.percent),
    squash: range(raw.squash, 0, LIMITS.percent),
  };
  const profile = convertProfile(raw.prof);
  if (profile) part.profile = profile;
  return part;
}

const idRank = (id: string): number => parseInt(id.replace(/\D/g, ''), 10) || 0;

const DAB_TYPES: Record<string, DabType> = { add: 'pull', dent: 'push', smooth: 'smooth', grab: 'grab' };

/** The prototype's "part frame" saved with each attached dab: origin, size and a row-major turn matrix. */
function readFrame(fr: unknown): PartFrame | null {
  if (!isRec(fr)) return null;
  const origin = vec3(fr.O);
  const size = vec3(fr.S);
  const rot = Array.isArray(fr.R) && fr.R.length === 9 && fr.R.every(isNum) ? (fr.R as number[]) : null;
  if (!origin || !size || !rot || size.some((s) => s <= 0)) return null;
  return { origin, size, rot };
}

/** The part whose box is closest to a point, ignoring cut-aways unless nothing else exists. */
function nearestPart(parts: Part[], w: Vec3): Part | undefined {
  const solid = parts.filter((p) => !p.cut);
  let best: Part | undefined;
  let bestScore: [number, number] = [Infinity, Infinity];
  for (const p of solid.length ? solid : parts) {
    const b = bbox(p.outline);
    const dx = Math.max(b.x0 - w[0], 0, w[0] - b.x1);
    const dy = Math.max(b.y0 - w[1], 0, w[1] - b.y1);
    const dz = Math.max(p.z - p.depthMm / 2 - w[2], 0, w[2] - (p.z + p.depthMm / 2));
    const score: [number, number] = [Math.hypot(dx, dy, dz), Math.hypot(w[0] - b.cx, w[1] - b.cy, w[2] - p.z)];
    if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The prototype saved sculpt dabs in world millimetres, with a frame for the part they were made on.
 * Each dab becomes a part-local dab. A mirrored dab (flag `s`) becomes two dabs: one on each side.
 */
function convertDabs(raw: unknown, parts: Part[], twinOf: Map<string, string>): Dab[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: Dab[] = [];

  for (const d of raw) {
    if (!isRec(d) || out.length >= LIMITS.dabs) continue;
    const type = typeof d.t === 'string' ? DAB_TYPES[d.t] : undefined;
    if (!type) continue;
    const isGrab = type === 'grab';

    let part: Part | undefined;
    let at: Vec3;
    let drag: Vec3 | undefined;
    let radius = num(d.r, 0);

    const attached = typeof d.pid === 'string' ? byId.get(d.pid) : undefined;
    const then = readFrame(d.fr); // the part's frame when the dab was made
    const c0 = vec3(d.c0);
    if (attached && then && c0) {
      // The prototype re-derived the dab from this frame every time, so the frame is the truth.
      part = attached;
      at = worldToLocal(then, c0);
      const dragWorld = vec3(d.d0) ?? vec3(d.d);
      if (isGrab) {
        if (!dragWorld) continue;
        drag = dirToLocal(then, dragWorld);
      }
      const now = partFrame(attached);
      const grow = (now.size[0] / then.size[0]) * (now.size[1] / then.size[1]) * (now.size[2] / then.size[2]);
      radius = num(d.r0, radius) * Math.cbrt(grow);
    } else {
      const c = vec3(d.c);
      if (!c) continue;
      part = nearestPart(parts, c);
      if (!part) continue;
      const now = partFrame(part);
      at = worldToLocal(now, c);
      const dragWorld = vec3(d.d);
      if (isGrab) {
        if (!dragWorld) continue;
        drag = dirToLocal(now, dragWorld);
      }
    }
    if (!(radius > 0)) continue;
    radius = clamp(radius, LIMITS.dabRadius[0], LIMITS.dabRadius[1]);
    const strength = type === 'smooth' ? range(d.w, 0.4, LIMITS.dabStrength) : 1;

    const make = (p: Part, a: Vec3, g: Vec3 | undefined): Dab => {
      const dab: Dab = { partId: p.id, type, at: a, radius, strength };
      if (g) dab.drag = g;
      return dab;
    };
    out.push(make(part, at, drag));

    if (d.s) {
      const frame = partFrame(part);
      const w = localToWorld(frame, at);
      if (Math.abs(w[0]) > 0.05) {
        const mirrored: Vec3 = [-w[0], w[1], w[2]];
        const twin = byId.get(twinOf.get(part.id) ?? '');
        const target = twin ?? nearestPart(parts, mirrored);
        if (target) {
          const tf = partFrame(target);
          let g: Vec3 | undefined;
          if (drag) {
            const dw = dirToWorld(frame, drag);
            g = dirToLocal(tf, [-dw[0], dw[1], dw[2]]);
          }
          out.push(make(target, worldToLocal(tf, mirrored), g));
        }
      }
    }
  }
  return out;
}

function convertGrooves(raw: unknown): Groove[] {
  if (!Array.isArray(raw)) return [];
  const out: Groove[] = [];
  for (const g of raw) {
    if (!isRec(g) || !Array.isArray(g.pts)) continue;
    const points = g.pts.map(vec3);
    if (points.length < 2 || points.some((p) => !p)) continue;
    out.push({ points: points as Vec3[], radius: range(g.r, 1.8, LIMITS.grooveRadius), mirror: !!g.sym });
  }
  return out;
}

function fromPrototype(save: Rec): Doc {
  const parts = (save.parts as unknown[]).map(convertPart).filter((p): p is Part => p !== null).slice(0, LIMITS.parts);

  // The prototype linked a mirrored pair both ways. The new format links the later one to the earlier one.
  const raws = new Map<string, Rec>();
  for (const r of save.parts as unknown[]) if (isRec(r) && typeof r.id === 'string') raws.set(r.id, r);
  const mutualTwin = new Map<string, string>();
  for (const p of parts) {
    const t = raws.get(p.id)?.twin;
    if (typeof t === 'string' && t !== p.id && raws.get(t)?.twin === p.id && parts.some((q) => q.id === t)) {
      mutualTwin.set(p.id, t);
    }
  }
  for (const p of parts) {
    const t = mutualTwin.get(p.id);
    if (t && (idRank(p.id) > idRank(t) || (idRank(p.id) === idRank(t) && p.id > t))) p.twinOf = t;
  }

  const doc = createDoc();
  doc.parts = parts;
  doc.dabs = convertDabs(save.sculpt, parts, mutualTwin);
  doc.grooves = convertGrooves(save.grooves);
  doc.settings.symmetry = save.symOn !== false;
  return validateDoc(doc);
}

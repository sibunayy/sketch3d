import { BUILD_MM, DOC_VERSION, PART_KINDS, PROFILE_MAX, PROFILE_SAMPLES } from './types';
import type { Doc } from './types';

/** Allowed ranges. Shared with migrate() so old saves are squeezed into the same limits. */
export const LIMITS = {
  parts: 300,
  grooves: 500,
  dabs: 20000,
  outlinePoints: 2000,
  groovePoints: 2000,
  nameLength: 80,
  idLength: 64,
  coordMm: 2000,
  depthMm: [1, 200],
  round: [0, 1],
  z: [-300, 300],
  blend: [0, 30],
  rotDeg: [-720, 720],
  percent: [-100, 100],
  dabAt: [-50, 50],
  dabRadius: [0.1, 100],
  dabStrength: [0, 5],
  grooveRadius: [0.1, 20],
} as const;

export const COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Thrown when a document cannot be used. `message` is safe to show to a child.
 * `detail` says exactly what was wrong, for developers and logs only.
 */
export class DocError extends Error {
  readonly detail: string;
  constructor(message: string, detail = '') {
    super(message);
    this.name = 'DocError';
    this.detail = detail;
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown, r: readonly [number, number]): v is number => isNum(v) && v >= r[0] && v <= r[1];
const isVec3 = (v: unknown, r?: readonly [number, number]): boolean =>
  Array.isArray(v) && v.length === 3 && v.every((n) => (r ? inRange(n, r) : isNum(n)));

export const notAToy = (detail = ''): DocError =>
  new DocError("This doesn't look like a Sketch3D toy. Try a different file.", detail);

export const cantOpen = (detail: string): DocError =>
  new DocError("This toy can't be opened because something in it is broken. Try opening an earlier copy.", detail);

const shortName = (v: unknown): string => {
  const s = typeof v === 'string' && v.trim() ? v.trim() : 'Part';
  return s.length > 24 ? s.slice(0, 24) + '…' : s;
};

function partError(part: Rec, index: number, key: string, problem: string): DocError {
  return new DocError(
    `The part "${shortName(part.name)}" has ${problem}, so the toy can't open. Try opening an earlier copy.`,
    `parts[${index}].${key} = ${JSON.stringify(part[key]) ?? String(part[key])}`,
  );
}

export function createDoc(): Doc {
  return {
    version: DOC_VERSION,
    parts: [],
    dabs: [],
    grooves: [],
    settings: { symmetry: true, build: { w: BUILD_MM, h: BUILD_MM, d: BUILD_MM } },
  };
}

function checkPart(p: unknown, i: number): asserts p is Rec {
  if (!isRec(p)) throw cantOpen(`parts[${i}] is not an object`);
  const bad = (key: string, problem: string) => partError(p, i, key, problem);
  const NUMBER = 'a number that does not work';

  if (typeof p.name !== 'string' || p.name.length > LIMITS.nameLength) throw bad('name', 'a name that does not work');
  if (!(PART_KINDS as readonly unknown[]).includes(p.kind)) throw bad('kind', 'a shape type that does not work');

  const o = p.outline;
  if (!Array.isArray(o) || o.length < 3 || o.length > LIMITS.outlinePoints) throw bad('outline', "a shape that isn't finished");
  for (const q of o) {
    if (!Array.isArray(q) || q.length !== 2 || !inRange(q[0], [-LIMITS.coordMm, LIMITS.coordMm]) || !inRange(q[1], [-LIMITS.coordMm, LIMITS.coordMm])) {
      throw bad('outline', "a shape that isn't finished");
    }
  }

  if (typeof p.color !== 'string' || !COLOR_PATTERN.test(p.color)) throw bad('color', 'a colour that does not work');
  if (!inRange(p.depthMm, LIMITS.depthMm)) throw bad('depthMm', NUMBER);
  if (!inRange(p.round, LIMITS.round)) throw bad('round', NUMBER);
  if (!inRange(p.z, LIMITS.z)) throw bad('z', NUMBER);
  if (!inRange(p.blend, LIMITS.blend)) throw bad('blend', NUMBER);
  if (typeof p.melt !== 'boolean') throw bad('melt', NUMBER);
  if (typeof p.cut !== 'boolean') throw bad('cut', NUMBER);
  if (!inRange(p.taper, LIMITS.percent)) throw bad('taper', NUMBER);
  if (!inRange(p.squash, LIMITS.percent)) throw bad('squash', NUMBER);

  const r = p.rot;
  if (!isRec(r) || !inRange(r.x, LIMITS.rotDeg) || !inRange(r.y, LIMITS.rotDeg) || !inRange(r.z, LIMITS.rotDeg)) throw bad('rot', NUMBER);

  if (p.profile !== undefined) {
    const pr = p.profile;
    const ok = (a: unknown) =>
      Array.isArray(a) && a.length === PROFILE_SAMPLES && a.every((v) => inRange(v, [-PROFILE_MAX, PROFILE_MAX]));
    if (!isRec(pr) || !ok(pr.front) || !ok(pr.back)) throw bad('profile', 'a side shape that does not work');
  }
  if (p.twinOf !== undefined && typeof p.twinOf !== 'string') throw bad('twinOf', 'a link to another part that does not work');
}

/**
 * Checks that `input` is a usable current-version document and returns a copy of it.
 * Throws DocError (with a message a child can read) if anything is wrong.
 */
export function validateDoc(input: unknown): Doc {
  if (!isRec(input)) throw notAToy('not an object');
  if (input.version !== DOC_VERSION) {
    if (typeof input.version === 'number') throw cantOpen(`version ${input.version}, expected ${DOC_VERSION}`);
    throw notAToy('no version');
  }
  const { parts, dabs, grooves, settings } = input;
  if (!Array.isArray(parts) || parts.length > LIMITS.parts) throw cantOpen('parts missing or too many');
  if (!Array.isArray(dabs) || dabs.length > LIMITS.dabs) throw cantOpen('dabs missing or too many');
  if (!Array.isArray(grooves) || grooves.length > LIMITS.grooves) throw cantOpen('grooves missing or too many');

  // part ids first, so links between parts can be checked
  const byId = new Map<string, Rec>();
  parts.forEach((p, i) => {
    checkPart(p, i);
    const id = p.id;
    if (typeof id !== 'string' || id === '' || id.length > LIMITS.idLength) throw partError(p, i, 'id', 'a name tag that does not work');
    if (byId.has(id)) throw partError(p, i, 'id', 'the same name tag as another part');
    byId.set(id, p);
  });
  parts.forEach((p: Rec, i) => {
    if (p.twinOf === undefined) return;
    const twin = byId.get(p.twinOf as string);
    if (!twin || twin === p || twin.twinOf !== undefined) {
      throw partError(p, i, 'twinOf', 'a link to another part that does not work');
    }
  });

  dabs.forEach((d, i) => {
    const bad = (key: string) => cantOpen(`dabs[${i}].${key} = ${JSON.stringify(isRec(d) ? d[key] : d)}`);
    if (!isRec(d)) throw bad('self');
    if (typeof d.partId !== 'string' || !byId.has(d.partId)) throw bad('partId');
    if (d.type !== 'push' && d.type !== 'pull' && d.type !== 'smooth' && d.type !== 'grab') throw bad('type');
    if (!isVec3(d.at, LIMITS.dabAt)) throw bad('at');
    if (!inRange(d.radius, LIMITS.dabRadius)) throw bad('radius');
    if (!inRange(d.strength, LIMITS.dabStrength)) throw bad('strength');
    if (d.drag !== undefined && !isVec3(d.drag, LIMITS.dabAt)) throw bad('drag');
  });

  grooves.forEach((g, i) => {
    const bad = (key: string) => cantOpen(`grooves[${i}].${key}`);
    if (!isRec(g)) throw bad('self');
    if (!Array.isArray(g.points) || g.points.length < 2 || g.points.length > LIMITS.groovePoints || !g.points.every((q) => isVec3(q))) throw bad('points');
    if (!inRange(g.radius, LIMITS.grooveRadius)) throw bad('radius');
    if (typeof g.mirror !== 'boolean') throw bad('mirror');
  });

  if (!isRec(settings) || typeof settings.symmetry !== 'boolean') throw cantOpen('settings.symmetry');
  const b = settings.build;
  if (!isRec(b) || b.w !== BUILD_MM || b.h !== BUILD_MM || b.d !== BUILD_MM) throw cantOpen('settings.build');

  return structuredClone(input) as unknown as Doc;
}

import { describe, expect, it } from 'vitest';
import legacyV2 from '../fixtures/legacy-v2.json';
import { DocError, validateDoc } from '../../src/core/doc/schema';
import { migrate } from '../../src/core/doc/migrate';
import { localToWorld, partFrame } from '../../src/core/doc/frame';
import type { Vec3 } from '../../src/core/geom/vec';
import { JARGON, makeDoc } from './helpers/docs';

type Legacy = typeof legacyV2;
const fresh = (): Legacy => structuredClone(legacyV2);
const partOf = (doc: ReturnType<typeof migrate>, id: string) => doc.parts.find((p) => p.id === id)!;
const worldOf = (doc: ReturnType<typeof migrate>, i: number): Vec3 => {
  const d = doc.dabs[i];
  return localToWorld(partFrame(partOf(doc, d.partId)), d.at);
};

describe('migrate: the prototype save (sketch3d.v2)', () => {
  it('converts the prototype save', () => {
    const doc = migrate(fresh());
    expect(doc.version).toBe(3);
    expect(doc.parts.length).toBe(6);
    doc.parts.forEach((p, i) => {
      expect(p.id).toBe(legacyV2.parts[i].id);
      expect(p.name).toBe(legacyV2.parts[i].name);
      expect(p.depthMm).toBe(legacyV2.parts[i].depth);
      expect(p.outline.length).toBe(legacyV2.parts[i].pts.length);
    });
    expect(() => validateDoc(doc)).not.toThrow();
  });

  it('sets the plain defaults the prototype left out', () => {
    const p = migrate(fresh()).parts[0];
    expect(p.melt).toBe(false);
    expect(p.cut).toBe(false);
    expect(p.rot).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.taper).toBe(0);
    expect(p.squash).toBe(0);
    expect(p.profile).toBeUndefined();
    expect(p.kind).toBe('draw');
  });

  it('turns the prototype mirror pairs into one-way twinOf links', () => {
    const doc = migrate(fresh());
    expect(partOf(doc, 'p1').twinOf).toBeUndefined();
    expect(partOf(doc, 'p2').twinOf).toBe('p1');
    expect(partOf(doc, 'p4').twinOf).toBeUndefined();
    expect(partOf(doc, 'p5').twinOf).toBe('p4');
    expect(doc.settings.symmetry).toBe(true);
  });

  it('attaches legacy sculpt dabs to the nearest part and stores them part-local', () => {
    const doc = migrate(fresh());
    // fixture: a mirrored "add" on the body (becomes 2 dabs), a "dent" on the body, an unattached "smooth" near the head
    expect(doc.dabs.map((d) => [d.partId, d.type])).toEqual([
      ['p3', 'pull'],
      ['p3', 'pull'], // the mirrored copy; the body has no twin, so it stays on the body
      ['p3', 'push'],
      ['p6', 'smooth'],
    ]);
    for (const d of doc.dabs) {
      // part-local means small numbers measured against the part's own size, not millimetres on the plate
      for (const v of d.at) expect(Math.abs(v)).toBeLessThan(1.5);
    }
    expect(doc.dabs[0].radius).toBeCloseTo(4.5, 6);
    expect(doc.dabs[3].strength).toBeCloseTo(0.35, 6);
  });

  it('keeps each dab at the same place in the world as the prototype had it', () => {
    const doc = migrate(fresh());
    const [add, mirrored, dent, smooth] = [0, 1, 2, 3].map((i) => worldOf(doc, i));
    const s = legacyV2.sculpt;
    expect(add).toEqual(s[0].c.map((v) => expect.closeTo(v, 5)));
    expect(mirrored).toEqual([expect.closeTo(-s[0].c[0], 5), expect.closeTo(s[0].c[1], 5), expect.closeTo(s[0].c[2], 5)]);
    expect(dent).toEqual(s[1].c.map((v) => expect.closeTo(v, 5)));
    expect(smooth).toEqual(s[2].c.map((v) => expect.closeTo(v, 5)));
  });

  it('makes dabs follow their part when it moves', () => {
    const doc = migrate(fresh());
    const before = worldOf(doc, 0);
    const body = partOf(doc, 'p3');
    body.outline = body.outline.map(([x, y]) => [x + 10, y]);
    const after = worldOf(doc, 0);
    expect(after[0]).toBeCloseTo(before[0] + 10, 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
    expect(after[2]).toBeCloseTo(before[2], 6);
  });

  it('puts the mirrored copy of a dab on the twin part', () => {
    const save = fresh();
    const leg = save.parts[0]; // Legs left, twin of p2
    const xs = leg.pts.map((q) => q[0]);
    const ys = leg.pts.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    save.sculpt = [{ t: 'add', r: 3, s: true, c: [cx, cy, 8] } as never];
    const doc = migrate(save);
    expect(doc.dabs.map((d) => d.partId)).toEqual(['p1', 'p2']);
    const [a, b] = [worldOf(doc, 0), worldOf(doc, 1)];
    expect(b[0]).toBeCloseTo(-a[0], 5);
    expect(b[1]).toBeCloseTo(a[1], 5);
  });

  it('converts grooves', () => {
    const doc = migrate(fresh());
    expect(doc.grooves).toEqual([
      { points: legacyV2.grooves[0].pts, radius: 1.8, mirror: false },
    ]);
  });

  it('resamples the 9-point side profile to 64 samples, ends included', () => {
    const save = fresh();
    (save.parts[0] as Record<string, unknown>).prof = {
      f: [1.5, 1.2, 1, 1, 1, 1, 1, 0.8, 0.5],
      b: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
    };
    const p = migrate(save).parts[0];
    expect(p.profile!.front).toHaveLength(64);
    expect(p.profile!.back).toHaveLength(64);
    expect(p.profile!.front[0]).toBeCloseTo(1.5, 6);
    expect(p.profile!.front[63]).toBeCloseTo(0.5, 6);
    expect(p.profile!.back.every((v) => Math.abs(v + 1) < 1e-9)).toBe(true);
  });

  it('carries over turn, taper, squash, melt and cut', () => {
    const save = fresh();
    Object.assign(save.parts[1], { rx: 30, ry: 10, rz: -5, taper: 20, squash: 15, melt: true, cut: true });
    const p = migrate(save).parts[1];
    expect(p.rot).toEqual({ x: 30, y: 10, z: -5 });
    expect([p.taper, p.squash, p.melt, p.cut]).toEqual([20, 15, true, true]);
  });

  it('skips broken parts and dabs instead of losing the whole toy', () => {
    const save = fresh();
    (save.parts as unknown[]).push({ id: 'p9', name: 'Broken' }, null);
    (save.sculpt as unknown[]).push({ t: 'poke', r: 3, c: [0, 0, 0] }, { t: 'add', r: -1, c: [0, 0, 0] }, { t: 'add', r: 3, c: [1, 2] });
    const doc = migrate(save);
    expect(doc.parts).toHaveLength(6);
    expect(doc.dabs).toHaveLength(4);
  });

  it('opens an empty prototype save as an empty toy', () => {
    const doc = migrate({ parts: [] });
    expect(doc.parts).toEqual([]);
    expect(doc.settings.symmetry).toBe(true);
  });
});

describe('migrate: current and unknown versions', () => {
  it('passes a current document through unchanged', () => {
    const doc = makeDoc();
    expect(migrate(doc)).toEqual(doc);
  });

  it('migrating twice gives the same result', () => {
    const once = migrate(fresh());
    expect(migrate(once)).toEqual(once);
  });

  it('refuses a toy from a newer Sketch3D with a clear message', () => {
    const err = catchError(() => migrate({ version: 99, parts: [] }));
    expect(err.message).toMatch(/newer/i);
    expect(err.message).not.toMatch(JARGON);
  });

  it('refuses an old numbered version it has no upgrade for', () => {
    const err = catchError(() => migrate({ version: 1, parts: [] }));
    expect(err.message).not.toMatch(JARGON);
  });

  it.each([null, undefined, 7, 'text', [], {}])('refuses %j as not a toy', (input) => {
    const err = catchError(() => migrate(input));
    expect(err.message).not.toMatch(JARGON);
  });
});

function catchError(fn: () => unknown): DocError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DocError);
    return e as DocError;
  }
  throw new Error('expected a DocError');
}
